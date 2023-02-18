// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron')
const { execSync } = require("child_process")
const iconv = require('iconv-lite')
const fs = require("fs")
const path = require('path')
const log = require("electron-log")
const md5 = require("md5")
const usbDetect = require('usb-detection')
const Store = require("electron-store")
const store = new Store()

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock)
    app.quit()
else {
    let mainWindow, isHiding = false
    let tray = null

    function createWindow() {
        // Create the browser window.
        mainWindow = new BrowserWindow({
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

        // 托盘
        if (!tray) {
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
                isHiding = true
            })
            mainWindow.setSkipTaskbar(true)   // 取消任务栏显示
            mainWindow.hide()    // 隐藏主程序窗口
            isHiding = true
            tray.on("click", (e) => {
                mainWindow.setSkipTaskbar(false)
                mainWindow.show()
                isHiding = false
            })
        }

        // and load the index.html of the app.
        mainWindow.loadFile('./pages/index.html')

        // 处理最大最小化时间
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

        //获取基本设置
        let copyQue = []
        let copieds = []
        let saveFileAddr = store.get("saveFile") || "D:\\Software Files\\UpBak"
        let whiteList = store.get("whitelist") || []
        if (whiteList.indexOf("ee1446735514853cb5ada41c19647259") == -1) //自动添加YEMASTER
            whiteList.push("ee1446735514853cb5ada41c19647259")

        // Detect USB Events 
        let driverList = []
        usbDetect.startMonitoring()
        usbDetect.on("add", () => {
            driverList = []
            updateList()
        })
        usbDetect.on("remove", () => {
            driverList = []
            updateList()
        })
        mainWindow.webContents.on('did-finish-load', () => {
            driverList = []
            updateList()
        })
        ipcMain.on("getConfig", () => {
            informConfig()
        })

        // 希望更改白名单
        ipcMain.on("update-white-list", function (_, w) {
            try {
                whiteList = w.split(",")
                if (whiteList.indexOf("ee1446735514853cb5ada41c19647259") == -1)
                    whiteList.push("ee1446735514853cb5ada41c19647259")
                log.info("Change whitelist to ", whiteList)
                store.set("whitelist", whiteList)
            }
            catch (e) { }
        })
        //希望更改保存路径
        ipcMain.on("ask-save-folder", function () {
            dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] }).then(result => {
                if (result.canceled)
                    return
                saveFileAddr = result.filePaths[0]
                store.set("saveFile", saveFileAddr)
                log.info("Change Save Folder to " + saveFileAddr)
                informConfig()
            }).catch(err => {
                log.error(err)
            })
        })
        // 告知设置
        function informConfig() {
            mainWindow.webContents.send("updateConfig", {
                saveFileAddr, whiteList
            })
        }
        // 获取已拷贝的文件
        function getCopieds(cb) {
            fs.readdir(saveFileAddr, (err, fsa) => {
                copieds = []
                if (err)
                    return
                for (let i in fsa) {
                    if (fsa[i].slice(0, 3) == "UP#")
                        copieds.push({ "n": fsa[i].slice(3), "l": saveFileAddr + "\\" + fsa[i] })
                }
                mainWindow.webContents.send("updateCopieds", copieds)
            })
        }
        function updateList() {
            // 获取系统磁盘信息
            driverList = []
            disks = iconv.decode(
                execSync("wmic logicaldisk get deviceid,volumename,description,size,freespace /value"),
                "cp936").split("\n")
            for (let i in disks)
                disks[i] = disks[i].trim()
            let tmp = {}, edited = false, flag = false
            for (let i in disks) {
                let p = disks[i].indexOf("=")
                if (p == -1) {
                    if (edited) {
                        if (tmp["VolumeName"].length == 0)
                            tmp["VolumeName"] = tmp["Description"]
                        tmp["isRemovable"] = true
                        if (tmp["Description"].indexOf("Fixed") > -1 || tmp["Description"].indexOf("固定") > -1)
                            tmp["isRemovable"] = false
                        tmp["used"] = Number(tmp["Size"] - tmp["FreeSpace"])
                        tmp["inWhite"] = false
                        if (whiteList.indexOf(md5(tmp["VolumeName"].toUpperCase())) != -1)
                            tmp["inWhite"] = true
                        if ((!tmp["inWhite"]) && tmp["isRemovable"] && tmp["DeviceID"] in copyQue == false) {
                            copyQue.push(tmp)
                            flag = true
                        }
                        driverList.push(tmp)
                    }
                    tmp = {}
                    edited = false
                }
                else {
                    edited = true
                    tmp[disks[i].slice(0, p)] = disks[i].slice(p + 1)
                }
            }
            if (flag)
                copyDisk()
            //console.log(driverList)
            getCopieds()
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
                    getCopieds()
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

    app.on('second-instance', () => {
        if (mainWindow) {
            if (isHiding)
                mainWindow.show()
            if (mainWindow.isMinimized())
                mainWindow.restore()
            mainWindow.focus()
        }
    })

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and require them here.
}