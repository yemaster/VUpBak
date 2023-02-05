const ipc = require('electron').ipcRenderer
const { shell } = require("electron")

let Vety = new Vue({
    el: "#app",
    data: {
        app: {
            name: 'VUpBak',
            version: '0.1.0 Beta',
            author: 'yemaster',
            updates: []
        },
        driverList: [],
        finished: [],
        isMax: false,
        nowCopying: "",
        menu: {
            tabMenuItems: [{
                icon: "24gl-home5",
                page: "UsbList",
                name: "主页"
            }, {
                icon: "24gl-gear2",
                page: "Settings",
                name: "设置",
            }, {
                icon: "24gl-infoCircle",
                page: "About",
                name: "关于",
            }
            ],
            chosenTab: "UsbList",
        },
        config: {
            saveFileAddr: "",
            whiteList: "",
        },
        loadText: "加载中",
        isloading: true,
        isLoadingFile: false,
        copyedSize: 0,
        isOpenContext: false,
        customPage: "",
    },
    mounted: function () {
        let _t = this
        _t.isloading = false

        // Send Prepare Signal
        ipc.send('getConfig')

        // Right Menu
        document.addEventListener("click", _t.closeContextMenu)

        $('.checkbox').checkbox()
        $('.vmenu .menuScroller').css({
            top: `${$(".vmenu a.active.item")[0].offsetTop + 22.5}px`,
            height: "15px"
        })
        $(".ui.dropdown.button").dropdown()
        $(_t.$refs[this.menu.chosenTab]).transition('fade up', '100ms')
        // Key Listener
        document.addEventListener("keydown", (e) => {
            //console.log(e)
            e.preventDefault()
            let pressedKey = e.key.toUpperCase()
            switch (pressedKey) {
                case "R":
                    if (e.ctrlKey)
                        ipc.send("window-reload")
                    break
                case "F4":
                    if (e.altKey)
                        ipc.send("window-close")
                    break
                case "F12":
                    ipc.send("window-debug")
                    break
            }
        })
    },
    methods: {
        parseLink(url) {
            let urlFC = url.split(":")
            let res = ""
            if (urlFC[0] == "github")
                res = "https://github.com/"
            res += urlFC[1]
            return res
        },
        openLink(lk) {
            shell.openExternal(this.parseLink(lk))
        },
        changeTab: function (d) {
            let _t = this
            if (_t.menu.tabMenuItems[d].page != this.menu.chosenTab) {
                $('.vmenu .menuScroller').css('top', `${d * 55 + 22.5}px`)
                $(_t.$refs[this.menu.chosenTab]).transition('fade up', '100ms')
                _t.menu.chosenTab = _t.menu.tabMenuItems[d].page
                setTimeout(function () {
                    $(_t.$refs[_t.menu.tabMenuItems[d].page]).transition('fade up', '100ms')
                }, 130)
            }
        },
        formatSize: function (e) {
            let sizeBase = ["B", "KB", "MB", "GB", "TB", "PB"]
            t = 0
            while (e >= 1024) {
                e /= 1024
                t += 1
            }
            return e.toFixed(2) + sizeBase[t]
        },
        formatSeconds: function (a) {
            var hh = parseInt(a / 3600);
            if (hh < 10) hh = "0" + hh;
            var mm = parseInt((a - hh * 3600) / 60);
            if (mm < 10) mm = "0" + mm;
            var ss = parseInt((a - hh * 3600) % 60);
            if (ss < 10) ss = "0" + ss;
            var length = hh + ":" + mm + ":" + ss;
            if (a > 0) {
                return length;
            } else {
                return "00:00:00";
            }
        },
        doUpdate: function () {
            for (let i in this.config)
                this.config[i] = this.config[i]
        },
        // Context Menu
        closeContextMenu() {
            let _t = this
            if (_t.isOpenContext) {
                $("#rightMenu").transition(`slide ${_t.isOpenContext} out`)
                _t.isOpenContext = false
            }
        },
        showContextMenu(q, e) {
            let _t = this
            _t.chooseEle = q
            let rm = document.getElementById("rightMenu")
            let mx = e.clientX;
            let my = e.clientY;
            let rmWidth = rm.offsetWidth;
            let rmHeight = rm.offsetHeight;
            let pageWidth = document.documentElement.clientWidth;
            let pageHeight = document.documentElement.clientHeight - 120;
            if ((mx + rmWidth) < pageWidth)
                rm.style.left = mx + "px";
            else
                rm.style.left = mx - rmWidth + "px";
            if ((my + rmHeight) < pageHeight) {
                rm.style.top = my + "px"
                _t.isOpenContext = "down"
                $("#rightMenu").transition("slide down in", "200ms")
            } else {
                rm.style.top = my - rmHeight + "px"
                _t.isOpenContext = "up"
                $("#rightMenu").transition("slide up in", "200ms")
            }
            return false;
        },
    }
})
document.getElementById('maxbtn').addEventListener('click', () => {
    ipc.send('window-max');
})
document.getElementById('minbtn').addEventListener('click', () => {
    ipc.send('window-min');
})
document.getElementById('closebtn').addEventListener('click', () => {
    ipc.send('window-close');
})
ipc.on('mainWin-max', (_, status) => {
    Vety.isMax = status
})
ipc.on('updateDriverList', (_, ps) => {
    Vety.driverList = ps
})
ipc.on('mes', (_, ic, ti, ms) => {
    Toast.fire({
        icon: ic,
        title: ti,
        text: ms
    })
})
ipc.on('startCopy', (_, t) => {
    Vety.copyedSize = 0
    Vety.nowCopying = t
})
ipc.on('addSize', (_, t) => {
    Vety.copyedSize += t
})
ipc.on('finishCopy', (_, t) => {
    Vety.nowCopying = ""
    if (Vety.finished.indexOf(t) == -1) {
        Vety.finished.push(t)
    }
})
ipc.on('updateConfig', (_, t) => {
    Vety.config = t
})