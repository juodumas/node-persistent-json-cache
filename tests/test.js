const existsSync = require('fs').existsSync
const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const test = require('ava')
const reservedKeys1 = ['constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf'];
const reservedKeys2 = ['__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', '__proto__'];

const persistent = require('../index')

const pow = Math.pow


function tempPath() {
    const name = 'tmp-' + Math.random().toString(36)
    return path.join(os.tmpdir(), name)
}

async function loadCacheJSON(path) {
    const raw = await fs.readFile(path)
    try {
        return JSON.parse(raw)
    }
    catch (e) {
        e.rawdata = String(raw, 'utf8')
        throw e
    }
}

test.beforeEach(async t => {
    t.context.path = tempPath()
})

test.afterEach.always(async t => {
    try { await fs.unlink(t.context.path) }
    catch (e) { if (e.code != 'ENOENT') throw e }
})

test('persistent.close() writes cache to file and no longer reacts to changes', async t => {
    let cache = await persistent(t.context.path)
    cache.obj = {}
    t.deepEqual(cache, {obj: {}})
    await persistent.close(cache)
    cache.obj2 = {}
    await persistent.close(cache) // second close should not do anything
    const data = await loadCacheJSON(t.context.path)
    t.deepEqual(data, {obj: {}}) // obj2 should not be saved
})

test('cache is only saved if it was modified', async t => {
    const pathExists = () => existsSync(t.context.path)
    let cache = await persistent(t.context.path)
    t.is(pathExists(), false)
    await persistent.close(cache)
    t.is(pathExists(), false)

    cache = await persistent(t.context.path)
    t.is(pathExists(), false)
    cache.obj = {}
    t.is(pathExists(), false)
    await persistent.close(cache)
    t.is(pathExists(), true)
})

test('new cache is an empty object', async t => {
    const cache = await persistent(t.context.path)
    t.is(typeof cache, 'object')
    t.deepEqual(cache, {})
    await persistent.close(cache)
})

test('cache is saved periodically (every 1000ms by default)', async t => {
    t.plan(4)
    const cache = await persistent(t.context.path)
    t.is(typeof cache, 'object')
    cache.obj = {}
    t.is(existsSync(t.context.path), false)
    return new Promise(resolve =>
        setTimeout(async () => {

            // cache file should not exist after 300ms
            t.is(existsSync(t.context.path), false)

            setTimeout(async () => {
                // cache file should exist after 1100ms
                t.is(existsSync(t.context.path), true)
                await persistent.close(cache)
                resolve()
            }, 1100)
        }, 300)
    )
})

test('periodic save interval can be changed', async t => {
    t.plan(4)
    const cache = await persistent(t.context.path, {savePeriod: 100})
    t.is(typeof cache, 'object')
    cache.obj = {}
    t.is(existsSync(t.context.path), false)
    return new Promise(resolve =>
        setTimeout(async () => {

            // cache file should not exist after 10ms
            t.is(existsSync(t.context.path), false)

            setTimeout(async () => {
                // cache file should exist after 110ms
                t.is(existsSync(t.context.path), true)
                await persistent.close(cache)
                resolve()
            }, 110)
        }, 10)
    )
})

test('can store complex objects', async t => {
    const cache = await persistent(t.context.path)
    const int1 = -pow(2, 32)
    const int2 = 0
    const int3 = pow(2, 32)
    const float1 = pow(2, 32) / 1000
    const float2 = -pow(2, 32) / 1000
    const str = 'juvenile-stainless-tinderbox-darkroom-flyover-congrats'
    const obj = {
        a: int1,
        b: int2,
        c: str,
        d: float1,
        e: float2,
        arr: [int1, int2, int3],
        obj2: {key: 'value'}
    }
    const array = [int1, int2, int3, str, obj, [float1, float2]]

    cache.array = array
    cache.obj = obj

    await persistent.close(cache)

    const data = await loadCacheJSON(t.context.path)
    t.deepEqual(data, {array, obj})
})

test('objects are assigned to cache by reference', async t => {
    // save a simple object in cache and close
    const obj = {key: 'val', arr: [1, 2, 3], l2: {}}
    let cache = await persistent(t.context.path)
    cache.obj = obj

    // cache.obj is wrapped in a proxy, so it does not have the same reference
    // as original
    t.not(cache.obj, obj)

    // but directly modifying the original object will change the proxy object
    obj.arr.push(4)
    obj.l2.one = 1
    t.deepEqual(cache.obj, {key: 'val', arr: [1, 2, 3, 4], l2: {one: 1}})

    // and modifying the proxy will change the original object
    cache.obj.arr.push(5)
    cache.obj.l2.two = 2
    t.deepEqual(cache.obj, {key: 'val', arr: [1, 2, 3, 4, 5], l2: {one: 1, two: 2}})

    await persistent.close(cache)

    // check that saved JSON is as expected
    let data = await loadCacheJSON(t.context.path)
    t.deepEqual(data, {obj: {key: 'val', arr: [1, 2, 3, 4, 5], l2: {one: 1, two: 2}}})
})

test('correctly detects array and object modifications', async t => {
    const obj = {key1: 1, arr: [1, 2, 3]}
    let cache = await persistent(t.context.path)
    cache.obj = JSON.parse(JSON.stringify(obj))
    t.deepEqual(cache, {obj})
    cache.obj.key2 = 2
    cache.obj.arr.push(4)
    obj.key2 = 2
    obj.arr.push(4)
    t.deepEqual(cache, {obj})
    await persistent.close(cache)
    let data = await loadCacheJSON(t.context.path)
    t.deepEqual(data, {obj})

    const deepArr = []
    cache = await persistent(t.context.path)
    cache.obj.arr.push({n: 1, deepArr})
    deepArr.push('item')
    await persistent.close(cache)
    obj.arr.push({n: 1, deepArr: ['item']})
    data = await loadCacheJSON(t.context.path)
    t.deepEqual(data, {obj})
})

test('no conflicts with inherited object properties', async t => {
    const path = t.context.path
    let cache = await persistent(path, {dict: true}) // no cache yet, empty object created
    cache.hi = 'hi'
    cache.a = [1,2,3];
    reservedKeys1.forEach(rk => t.assert(cache[rk] === undefined));
    reservedKeys2.forEach(rk => t.assert(cache[rk] === undefined));
    await persistent.close(cache)
    cache = await persistent(path, {dict: true}) // there is a cache already, empty object loaded from JSON
    t.assert(cache.hi === 'hi')
    t.assert(Array.isArray(cache.a));
    reservedKeys1.forEach(rk => t.assert(cache[rk] === undefined));
    reservedKeys2.forEach(rk => t.assert(cache[rk] === undefined));

    reservedKeys1.forEach(rk => {
        cache[rk] = 'hello';
        t.assert(cache[rk] === 'hello')
    });
    reservedKeys2.forEach(rk => {
        cache[rk] = 'hello';
        t.assert(cache[rk] === 'hello')
    });
    await persistent.close(cache)
    cache = await persistent(path, {dict: true})
    reservedKeys1.forEach(rk => t.assert(cache[rk] === 'hello'));
    reservedKeys2.forEach(rk => t.assert(cache[rk] === 'hello'));
})
