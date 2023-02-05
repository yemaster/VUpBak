// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron')
const { execSync } = require("child_process")
const iconv = require('iconv-lite')
const fs = require("fs")
const path = require('path')
const Store = require("electron-store")
const store = new Store()
const log = require("electron-log")
const usbDetect = require('usb-detection')

usbDetect.startMonitoring()

let tray = null

function createWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 480,
        height: 640,
        minWidth: 300,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, './logo.ico')
    })

    // Tray
    tray = new Tray('./logo.ico')
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "退出", click: function () {
                mainWindow.destroy()
                app.quit()
            }
        },
    ])
    tray.setToolTip('VUpBak')
    tray.setContextMenu(contextMenu)
    mainWindow.on('close', (e) => {
        e.preventDefault()  // 阻止退出程序
        mainWindow.setSkipTaskbar(true)   // 取消任务栏显示
        mainWindow.hide()    // 隐藏主程序窗口
    })
    tray.on("click", (e) => {
        mainWindow.show()
    })
    mainWindow.setSkipTaskbar(true)
    mainWindow.hide()

    // and load the index.html of the app.
    mainWindow.loadFile('./pages/index.html')
    ipcMain.on('window-min', function () {
        mainWindow.minimize();
    })
    ipcMain.on('window-max', function () {
        if (mainWindow.isMaximized()) {
            mainWindow.restore();
        } else {
            mainWindow.maximize();
        }
    })
    ipcMain.on('window-close', function () {
        mainWindow.close();
    })
    ipcMain.on('window-reload', function () {
        mainWindow.reload();
    })
    ipcMain.on('window-debug', function () {
        mainWindow.webContents.toggleDevTools();
    })
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('mainWin-max', true)
    })
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('mainWin-max', false)
    })
    let driverList = []
    usbDetect.on("add", () => {
        driverList = []
        updateList()
    })
    usbDetect.on("remove", (d) => {
        driverList = []
        updateList()
    })
    mainWindow.webContents.on('did-finish-load', () => {
        driverList = []
        updateList()
    })
    let copyQue = []
    let saveFileAddr = store.get("saveFile") || "D:\\Software Files\\UpBak"
    let whiteList = store.get("whitelist") || []
    ipcMain.on("getConfig", () => {
        mainWindow.webContents.send("updateConfig", {
            saveFileAddr, whiteList
        })
    })
    function updateList() {
        // 获取系统磁盘信息
        driverList = []
        disks = iconv.decode(execSync("wmic logicaldisk get deviceid,volumename,description,size,freespace"), "cp936").split("\n")
        for (let i in disks)
            disks[i] = disks[i].trimEnd()
        // 第0行加上一个没用的空格和字符串防止最后一个项目不被添加
        disks[0] += " orzlin_diex"
        let strRanges = []
        let st = 0, ed = 0, tag = ""
        for (let i = 0; i < disks[0].length; ++i)
            if (i > 0 && disks[0][i - 1] == " " && disks[0][i] != " ") { // 获取每一个信息的位置
                if (ed > st)
                    strRanges.push([tag.trimEnd(), st, ed])
                tag = disks[0][i]
                st = i
            }
            else {
                tag += disks[0][i]
                ed = i + 1
            }
        strRanges[strRanges.length - 1][2] = 12345 // 防止最后一个截取的不够长
        flag = false
        for (let i = 1; i < disks.length; ++i) {
            if (disks[i].length < 1)
                continue
            let tmp = {}
            for (let j in strRanges) {
                tmp[strRanges[j][0]] = disks[i].slice(strRanges[j][1], strRanges[j][2]).trimEnd()
            }
            tmp["isRemovable"] = tmp["Description"].indexOf("Removable")
            tmp["used"] = Number(tmp["Size"] - tmp["FreeSpace"])
            if (tmp["isRemovable"] != -1 && tmp["DeviceID"] in copyQue == false) {
                copyQue.push(tmp)
                flag = true
            }
            driverList.push(tmp)
        }
        if (flag)
            copyDisk()
        //console.log(driverList)
        mainWindow.webContents.send("updateDriverList", driverList)
    }
    let fileNeedCopy = [], dirNeedWork = [], isCopying = false
    function clearFileNeedCopy(p, n, callback) {
        if (fileNeedCopy.length == 0) { // 没有东西了直接调回去
            callback()
        }
        else {
            let from = p + "\\" + fileNeedCopy[0]
            let to = saveFileAddr + "\\" + "UP#" + n + "\\" + fileNeedCopy[0]
            if (fileNeedCopy[0] != "") { // 空的就不用写了
                log.info("Start to copy " + from + " to " + to)
                fs.copyFile(from, to, (err) => {
                    if (err) {
                        console.log("ERROR:", err)
                    }
                    mainWindow.webContents.send("addSize", fileNeedCopy[1])
                    fileNeedCopy = fileNeedCopy.slice(2)
                    clearFileNeedCopy(p, n, callback)
                })
            }
            else {
                mainWindow.webContents.send("addSize", fileNeedCopy[1])
                fileNeedCopy = fileNeedCopy.slice(2)
                clearFileNeedCopy(p, n, callback)
            }
        }
    }
    function copyDiskFiles(p, n, callback) {
        // p是递归遍历的盘符，n是U盘名称
        if (dirNeedWork.length == 0) {
            callback()
        }
        else {
            let d = dirNeedWork[0]
            //console.log("Start to work dir " + p + d)
            mkdirs(saveFileAddr + "\\" + "UP#" + n + "\\" + d, () => {
                fs.readdir(p + d, (err, nowFiles) => {
                    if (err) {
                        console.log("ERROR when read dir")
                    }
                    for (let i in nowFiles) {
                        let fn = p + d + nowFiles[i]
                        let to = saveFileAddr + "\\" + "UP#" + n + "\\" + d + "\\" + nowFiles[i]
                        /*fs.stat(fn, (err, stat) => {
                            if (err) {
                                console.log("ERROR when get file stat")
                            }
                            if (stat.isDirectory()) {
                                console.log("Find directory " + p + d + nowFiles[i])
                                dirNeedWork.push(d + nowFiles[i])
                                //copyDiskFiles(fn + "\\", to + "\\", () => { })
                            }
                            else if (stat.isFile()) {
                                console.log("Find file " + p + d + nowFiles[i])
                                fs.stat(to, (err, st) => {
                                    if (err || st.size != stat.size) {
                                        console.log("Add file " + fn + " to " + to)
                                        fileNeedCopy.push(d + nowFiles[i])
                                        fileNeedCopy.push(stat.size)
                                    }
                                })
                            }
                        })*/
                        let stat = fs.statSync(fn)
                        if (stat.isDirectory()) {
                            //console.log("Find directory " + p + d + nowFiles[i])
                            dirNeedWork.push(d + nowFiles[i] + "\\")
                            //copyDiskFiles(fn + "\\", to + "\\", () => { })
                        }
                        else if (stat.isFile()) {
                            //console.log("Find file " + p + d + nowFiles[i])
                            try {
                                let st = fs.statSync(to)
                                if (st.size != stat.size) {
                                    //console.log("Add file " + fn + " to " + to)
                                    fileNeedCopy.push(d + nowFiles[i])
                                    fileNeedCopy.push(stat.size)
                                }
                                else {
                                    fileNeedCopy.push("")
                                    fileNeedCopy.push(stat.size)
                                }
                            }
                            catch (err) {
                                //console.log("Add file " + fn + " to " + to)
                                fileNeedCopy.push(d + nowFiles[i])
                                fileNeedCopy.push(stat.size)
                            }
                        }
                    }
                    //console.log(dirNeedWork)
                    clearFileNeedCopy(p, n, () => {
                        dirNeedWork = dirNeedWork.slice(1)
                        copyDiskFiles(p, n, callback)
                    })
                })
            })
        }
    }

    function mkdirs(dirname, callback) {
        fs.exists(dirname, function (es) {
            if (es) {
                callback()
            } else {
                mkdirs(path.dirname(dirname), function () {
                    fs.mkdir(dirname, callback)
                })
            }
        })
    }
    function copyDisk() {
        mkdirs(saveFileAddr, () => {
            if (copyQue.length <= 0 || isCopying)
                return
            isCopying = true
            fileNeedCopy = []
            dirNeedWork = ["\\"]
            mainWindow.webContents.send("startCopy", copyQue[0]["DeviceID"])
            log.info("Detect " + copyQue[0]["VolumeName"] + "(" + copyQue[0]["DeviceID"] + ")")
            copyDiskFiles(copyQue[0]["DeviceID"], copyQue[0]["VolumeName"], () => {
                mainWindow.webContents.send("finishCopy", copyQue[0]["DeviceID"])
                copyQue = copyQue.slice(1)
                if (copyQue.length > 0)
                    copyDisk()
                isCopying = false
            })
        })
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow()
    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.