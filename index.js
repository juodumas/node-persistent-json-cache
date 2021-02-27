const fs = require('fs')
const util = require('util')

const fileExists = util.promisify(fs.exists)
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const apiByPath = {}
const apiByProxy = new Map()

let cleanupsRegistered = false


function cleanupAll() {
    apiByProxy.forEach(api => api.closeSync())
}


async function init(path, opts) {
    const period = (opts && opts.savePeriod) || 1000
    let api = {}
    let proxy = {}
    let modified = false
    let timerId

    if (!path) {
        throw new Error("path required")
    }

    if (apiByPath[path]) {
        api = apiByPath[path]
        proxy = api.proxy
        return proxy
    }

    async function save() {
        if (modified) {
            modified = false
            await writeFile(path, JSON.stringify(proxy))
        }
    }

    function saveSync() {
        if (modified) {
            modified = false
            fs.writeFileSync(path, JSON.stringify(proxy))
        }
    }

    function _closeCommon() {
        clearTimeout(timerId)
        delete apiByPath[path]
        apiByProxy.delete(proxy)
    }

    async function close() {
        _closeCommon()
        return await save()
    }

    function closeSync() {
        _closeCommon()
        return saveSync()
    }

    async function periodicSave() {
        await save()
        timerId = setTimeout(periodicSave, period)
    }

    function createProxy(object) {
        return new Proxy(object, {
            get(target, prop) {
                return target[prop]
            },
            set(target, prop, value) {
                if (value && typeof value == "object") {
                    target[prop] = createProxy(value)
                }
                else {
                    target[prop] = value
                }
                modified = true
                return true
            },
            deleteProperty(target, key) {
                if (Array.isArray(target)) {
                    target.splice(key, 1)
                    modified = true
                }
                else {
                    target[key] = undefined
                    delete target[key]
                    modified = true
                }
                return true
            },
            has(target, key) {
                return key in target
            },
        })
    }

    function proxyRecurse(object) {
        for (let key in object) {
            if (object[key] && typeof(object[key]) == "object") {
                object[key] = proxyRecurse(object[key])
            }
        }
        return createProxy(object)
    }

    if (!cleanupsRegistered) {
        // Try to save data on all kinds of exits.
        ["SIGINT", "SIGTERM", "exit"].forEach(ev => {
            process.on(ev, cleanupAll)
        })
        cleanupsRegistered = true
    }
    if(!opts || !opts.dict){
        if (await fileExists(path)) {
            proxy = proxyRecurse(JSON.parse(await readFile(path)))
        }
        else {
            proxy = createProxy({})
        }
    }else{ // use objects without prototype to avoid keys conflicts with inherited props like 'constructor'
        if (await fileExists(path)) {
            const c = JSON.parse(await readFile(path), (k,v) => {
                if(typeof v === 'object' && v !== null){
                  return Object.assign(Object.create(null),v)
                }
                return v
            })
            proxy = proxyRecurse(c)
        }
        else {
            proxy = createProxy(Object.create(null))
        }
    }

    periodicSave()
    api = {proxy, path, save, close, closeSync}
    apiByProxy.set(proxy, api)
    apiByPath[path] = api
    return proxy
}


async function close(proxy) {
    const obj = apiByProxy.get(proxy)
    if (obj) {
        await obj.close()
    }
}


init.close = close

module.exports = init
