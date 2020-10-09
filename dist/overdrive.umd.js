(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global.VOverdrive = {}));
}(this, (function (exports) { 'use strict';

    /**
     * Make a map and return a function for checking if a key
     * is in that map.
     * IMPORTANT: all calls of this function must be prefixed with
     * \/\*#\_\_PURE\_\_\*\/
     * So that rollup can tree-shake them if necessary.
     */
    function makeMap(str, expectsLowerCase) {
        const map = Object.create(null);
        const list = str.split(',');
        for (let i = 0; i < list.length; i++) {
            map[list[i]] = true;
        }
        return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
    }

    const GLOBALS_WHITE_LISTED = 'Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,' +
        'decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,' +
        'Object,Boolean,String,RegExp,Map,Set,JSON,Intl';
    const isGloballyWhitelisted = /*#__PURE__*/ makeMap(GLOBALS_WHITE_LISTED);

    function normalizeStyle(value) {
        if (isArray(value)) {
            const res = {};
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                const normalized = normalizeStyle(isString(item) ? parseStringStyle(item) : item);
                if (normalized) {
                    for (const key in normalized) {
                        res[key] = normalized[key];
                    }
                }
            }
            return res;
        }
        else if (isObject(value)) {
            return value;
        }
    }
    const listDelimiterRE = /;(?![^(]*\))/g;
    const propertyDelimiterRE = /:(.+)/;
    function parseStringStyle(cssText) {
        const ret = {};
        cssText.split(listDelimiterRE).forEach(item => {
            if (item) {
                const tmp = item.split(propertyDelimiterRE);
                tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
            }
        });
        return ret;
    }
    function normalizeClass(value) {
        let res = '';
        if (isString(value)) {
            res = value;
        }
        else if (isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                res += normalizeClass(value[i]) + ' ';
            }
        }
        else if (isObject(value)) {
            for (const name in value) {
                if (value[name]) {
                    res += name + ' ';
                }
            }
        }
        return res.trim();
    }
    const EMPTY_OBJ = (process.env.NODE_ENV !== 'production')
        ? Object.freeze({})
        : {};
    const NOOP = () => { };
    const onRE = /^on[^a-z]/;
    const isOn = (key) => onRE.test(key);
    const extend = Object.assign;
    const remove = (arr, el) => {
        const i = arr.indexOf(el);
        if (i > -1) {
            arr.splice(i, 1);
        }
    };
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    const hasOwn = (val, key) => hasOwnProperty.call(val, key);
    const isArray = Array.isArray;
    const isMap = (val) => toTypeString(val) === '[object Map]';
    const isSet = (val) => toTypeString(val) === '[object Set]';
    const isFunction = (val) => typeof val === 'function';
    const isString = (val) => typeof val === 'string';
    const isSymbol = (val) => typeof val === 'symbol';
    const isObject = (val) => val !== null && typeof val === 'object';
    const isPromise = (val) => {
        return isObject(val) && isFunction(val.then) && isFunction(val.catch);
    };
    const objectToString = Object.prototype.toString;
    const toTypeString = (value) => objectToString.call(value);
    const toRawType = (value) => {
        return toTypeString(value).slice(8, -1);
    };
    const isIntegerKey = (key) => isString(key) &&
        key !== 'NaN' &&
        key[0] !== '-' &&
        '' + parseInt(key, 10) === key;
    const cacheStringFunction = (fn) => {
        const cache = Object.create(null);
        return ((str) => {
            const hit = cache[str];
            return hit || (cache[str] = fn(str));
        });
    };
    /**
     * @private
     */
    const capitalize = cacheStringFunction((str) => {
        return str.charAt(0).toUpperCase() + str.slice(1);
    });
    // compare whether a value has changed, accounting for NaN.
    const hasChanged = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);
    let _globalThis;
    const getGlobalThis = () => {
        return (_globalThis ||
            (_globalThis =
                typeof globalThis !== 'undefined'
                    ? globalThis
                    : typeof self !== 'undefined'
                        ? self
                        : typeof window !== 'undefined'
                            ? window
                            : typeof global !== 'undefined'
                                ? global
                                : {}));
    };

    const targetMap = new WeakMap();
    const effectStack = [];
    let activeEffect;
    const ITERATE_KEY = Symbol((process.env.NODE_ENV !== 'production') ? 'iterate' : '');
    const MAP_KEY_ITERATE_KEY = Symbol((process.env.NODE_ENV !== 'production') ? 'Map key iterate' : '');
    function isEffect(fn) {
        return fn && fn._isEffect === true;
    }
    function effect(fn, options = EMPTY_OBJ) {
        if (isEffect(fn)) {
            fn = fn.raw;
        }
        const effect = createReactiveEffect(fn, options);
        if (!options.lazy) {
            effect();
        }
        return effect;
    }
    function stop(effect) {
        if (effect.active) {
            cleanup(effect);
            if (effect.options.onStop) {
                effect.options.onStop();
            }
            effect.active = false;
        }
    }
    let uid = 0;
    function createReactiveEffect(fn, options) {
        const effect = function reactiveEffect() {
            if (!effect.active) {
                return options.scheduler ? undefined : fn();
            }
            if (!effectStack.includes(effect)) {
                cleanup(effect);
                try {
                    enableTracking();
                    effectStack.push(effect);
                    activeEffect = effect;
                    return fn();
                }
                finally {
                    effectStack.pop();
                    resetTracking();
                    activeEffect = effectStack[effectStack.length - 1];
                }
            }
        };
        effect.id = uid++;
        effect._isEffect = true;
        effect.active = true;
        effect.raw = fn;
        effect.deps = [];
        effect.options = options;
        return effect;
    }
    function cleanup(effect) {
        const { deps } = effect;
        if (deps.length) {
            for (let i = 0; i < deps.length; i++) {
                deps[i].delete(effect);
            }
            deps.length = 0;
        }
    }
    let shouldTrack = true;
    const trackStack = [];
    function pauseTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = false;
    }
    function enableTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = true;
    }
    function resetTracking() {
        const last = trackStack.pop();
        shouldTrack = last === undefined ? true : last;
    }
    function track(target, type, key) {
        if (!shouldTrack || activeEffect === undefined) {
            return;
        }
        let depsMap = targetMap.get(target);
        if (!depsMap) {
            targetMap.set(target, (depsMap = new Map()));
        }
        let dep = depsMap.get(key);
        if (!dep) {
            depsMap.set(key, (dep = new Set()));
        }
        if (!dep.has(activeEffect)) {
            dep.add(activeEffect);
            activeEffect.deps.push(dep);
            if ((process.env.NODE_ENV !== 'production') && activeEffect.options.onTrack) {
                activeEffect.options.onTrack({
                    effect: activeEffect,
                    target,
                    type,
                    key
                });
            }
        }
    }
    function trigger(target, type, key, newValue, oldValue, oldTarget) {
        const depsMap = targetMap.get(target);
        if (!depsMap) {
            // never been tracked
            return;
        }
        const effects = new Set();
        const add = (effectsToAdd) => {
            if (effectsToAdd) {
                effectsToAdd.forEach(effect => {
                    if (effect !== activeEffect || effect.options.allowRecurse) {
                        effects.add(effect);
                    }
                });
            }
        };
        if (type === "clear" /* CLEAR */) {
            // collection being cleared
            // trigger all effects for target
            depsMap.forEach(add);
        }
        else if (key === 'length' && isArray(target)) {
            depsMap.forEach((dep, key) => {
                if (key === 'length' || key >= newValue) {
                    add(dep);
                }
            });
        }
        else {
            // schedule runs for SET | ADD | DELETE
            if (key !== void 0) {
                add(depsMap.get(key));
            }
            // also run for iteration key on ADD | DELETE | Map.SET
            switch (type) {
                case "add" /* ADD */:
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    }
                    else if (isIntegerKey(key)) {
                        // new index added to array -> length changes
                        add(depsMap.get('length'));
                    }
                    break;
                case "delete" /* DELETE */:
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    }
                    break;
                case "set" /* SET */:
                    if (isMap(target)) {
                        add(depsMap.get(ITERATE_KEY));
                    }
                    break;
            }
        }
        const run = (effect) => {
            if ((process.env.NODE_ENV !== 'production') && effect.options.onTrigger) {
                effect.options.onTrigger({
                    effect,
                    target,
                    key,
                    type,
                    newValue,
                    oldValue,
                    oldTarget
                });
            }
            if (effect.options.scheduler) {
                effect.options.scheduler(effect);
            }
            else {
                effect();
            }
        };
        effects.forEach(run);
    }

    const builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol)
        .map(key => Symbol[key])
        .filter(isSymbol));
    const get = /*#__PURE__*/ createGetter();
    const shallowGet = /*#__PURE__*/ createGetter(false, true);
    const readonlyGet = /*#__PURE__*/ createGetter(true);
    const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true);
    const arrayInstrumentations = {};
    ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function (...args) {
            const arr = toRaw(this);
            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, "get" /* GET */, i + '');
            }
            // we run the method using the original args first (which may be reactive)
            const res = method.apply(arr, args);
            if (res === -1 || res === false) {
                // if that didn't work, run it again using raw values.
                return method.apply(arr, args.map(toRaw));
            }
            else {
                return res;
            }
        };
    });
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function (...args) {
            pauseTracking();
            const res = method.apply(this, args);
            enableTracking();
            return res;
        };
    });
    function createGetter(isReadonly = false, shallow = false) {
        return function get(target, key, receiver) {
            if (key === "__v_isReactive" /* IS_REACTIVE */) {
                return !isReadonly;
            }
            else if (key === "__v_isReadonly" /* IS_READONLY */) {
                return isReadonly;
            }
            else if (key === "__v_raw" /* RAW */ &&
                receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)) {
                return target;
            }
            const targetIsArray = isArray(target);
            if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
                return Reflect.get(arrayInstrumentations, key, receiver);
            }
            const res = Reflect.get(target, key, receiver);
            const keyIsSymbol = isSymbol(key);
            if (keyIsSymbol
                ? builtInSymbols.has(key)
                : key === `__proto__` || key === `__v_isRef`) {
                return res;
            }
            if (!isReadonly) {
                track(target, "get" /* GET */, key);
            }
            if (shallow) {
                return res;
            }
            if (isRef(res)) {
                // ref unwrapping - does not apply for Array + integer key.
                const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
                return shouldUnwrap ? res.value : res;
            }
            if (isObject(res)) {
                // Convert returned value into a proxy as well. we do the isObject check
                // here to avoid invalid value warning. Also need to lazy access readonly
                // and reactive here to avoid circular dependency.
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;
        };
    }
    const set = /*#__PURE__*/ createSetter();
    const shallowSet = /*#__PURE__*/ createSetter(true);
    function createSetter(shallow = false) {
        return function set(target, key, value, receiver) {
            const oldValue = target[key];
            if (!shallow) {
                value = toRaw(value);
                if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                    oldValue.value = value;
                    return true;
                }
            }
            const hadKey = isArray(target) && isIntegerKey(key)
                ? Number(key) < target.length
                : hasOwn(target, key);
            const result = Reflect.set(target, key, value, receiver);
            // don't trigger if target is something up in the prototype chain of original
            if (target === toRaw(receiver)) {
                if (!hadKey) {
                    trigger(target, "add" /* ADD */, key, value);
                }
                else if (hasChanged(value, oldValue)) {
                    trigger(target, "set" /* SET */, key, value, oldValue);
                }
            }
            return result;
        };
    }
    function deleteProperty(target, key) {
        const hadKey = hasOwn(target, key);
        const oldValue = target[key];
        const result = Reflect.deleteProperty(target, key);
        if (result && hadKey) {
            trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
        }
        return result;
    }
    function has(target, key) {
        const result = Reflect.has(target, key);
        if (!isSymbol(key) || !builtInSymbols.has(key)) {
            track(target, "has" /* HAS */, key);
        }
        return result;
    }
    function ownKeys(target) {
        track(target, "iterate" /* ITERATE */, ITERATE_KEY);
        return Reflect.ownKeys(target);
    }
    const mutableHandlers = {
        get,
        set,
        deleteProperty,
        has,
        ownKeys
    };
    const readonlyHandlers = {
        get: readonlyGet,
        set(target, key) {
            if ((process.env.NODE_ENV !== 'production')) {
                console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        },
        deleteProperty(target, key) {
            if ((process.env.NODE_ENV !== 'production')) {
                console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        }
    };
    const shallowReactiveHandlers = extend({}, mutableHandlers, {
        get: shallowGet,
        set: shallowSet
    });
    // Props handlers are special in the sense that it should not unwrap top-level
    // refs (in order to allow refs to be explicitly passed down), but should
    // retain the reactivity of the normal readonly object.
    const shallowReadonlyHandlers = extend({}, readonlyHandlers, {
        get: shallowReadonlyGet
    });

    const toReactive = (value) => isObject(value) ? reactive(value) : value;
    const toReadonly = (value) => isObject(value) ? readonly(value) : value;
    const toShallow = (value) => value;
    const getProto = (v) => Reflect.getPrototypeOf(v);
    function get$1(target, key, isReadonly = false, isShallow = false) {
        // #1772: readonly(reactive(Map)) should return readonly + reactive version
        // of the value
        target = target["__v_raw" /* RAW */];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "get" /* GET */, key);
        }
        !isReadonly && track(rawTarget, "get" /* GET */, rawKey);
        const { has } = getProto(rawTarget);
        const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
        if (has.call(rawTarget, key)) {
            return wrap(target.get(key));
        }
        else if (has.call(rawTarget, rawKey)) {
            return wrap(target.get(rawKey));
        }
    }
    function has$1(key, isReadonly = false) {
        const target = this["__v_raw" /* RAW */];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "has" /* HAS */, key);
        }
        !isReadonly && track(rawTarget, "has" /* HAS */, rawKey);
        return key === rawKey
            ? target.has(key)
            : target.has(key) || target.has(rawKey);
    }
    function size(target, isReadonly = false) {
        target = target["__v_raw" /* RAW */];
        !isReadonly && track(toRaw(target), "iterate" /* ITERATE */, ITERATE_KEY);
        return Reflect.get(target, 'size', target);
    }
    function add(value) {
        value = toRaw(value);
        const target = toRaw(this);
        const proto = getProto(target);
        const hadKey = proto.has.call(target, value);
        const result = target.add(value);
        if (!hadKey) {
            trigger(target, "add" /* ADD */, value, value);
        }
        return result;
    }
    function set$1(key, value) {
        value = toRaw(value);
        const target = toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has.call(target, key);
        }
        else if ((process.env.NODE_ENV !== 'production')) {
            checkIdentityKeys(target, has, key);
        }
        const oldValue = get.call(target, key);
        const result = target.set(key, value);
        if (!hadKey) {
            trigger(target, "add" /* ADD */, key, value);
        }
        else if (hasChanged(value, oldValue)) {
            trigger(target, "set" /* SET */, key, value, oldValue);
        }
        return result;
    }
    function deleteEntry(key) {
        const target = toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has.call(target, key);
        }
        else if ((process.env.NODE_ENV !== 'production')) {
            checkIdentityKeys(target, has, key);
        }
        const oldValue = get ? get.call(target, key) : undefined;
        // forward the operation before queueing reactions
        const result = target.delete(key);
        if (hadKey) {
            trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
        }
        return result;
    }
    function clear() {
        const target = toRaw(this);
        const hadItems = target.size !== 0;
        const oldTarget = (process.env.NODE_ENV !== 'production')
            ? isMap(target)
                ? new Map(target)
                : new Set(target)
            : undefined;
        // forward the operation before queueing reactions
        const result = target.clear();
        if (hadItems) {
            trigger(target, "clear" /* CLEAR */, undefined, undefined, oldTarget);
        }
        return result;
    }
    function createForEach(isReadonly, isShallow) {
        return function forEach(callback, thisArg) {
            const observed = this;
            const target = observed["__v_raw" /* RAW */];
            const rawTarget = toRaw(target);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly && track(rawTarget, "iterate" /* ITERATE */, ITERATE_KEY);
            return target.forEach((value, key) => {
                // important: make sure the callback is
                // 1. invoked with the reactive map as `this` and 3rd arg
                // 2. the value received should be a corresponding reactive/readonly.
                return callback.call(thisArg, wrap(value), wrap(key), observed);
            });
        };
    }
    function createIterableMethod(method, isReadonly, isShallow) {
        return function (...args) {
            const target = this["__v_raw" /* RAW */];
            const rawTarget = toRaw(target);
            const targetIsMap = isMap(rawTarget);
            const isPair = method === 'entries' || (method === Symbol.iterator && targetIsMap);
            const isKeyOnly = method === 'keys' && targetIsMap;
            const innerIterator = target[method](...args);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly &&
                track(rawTarget, "iterate" /* ITERATE */, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
            // return a wrapped iterator which returns observed versions of the
            // values emitted from the real iterator
            return {
                // iterator protocol
                next() {
                    const { value, done } = innerIterator.next();
                    return done
                        ? { value, done }
                        : {
                            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                            done
                        };
                },
                // iterable protocol
                [Symbol.iterator]() {
                    return this;
                }
            };
        };
    }
    function createReadonlyMethod(type) {
        return function (...args) {
            if ((process.env.NODE_ENV !== 'production')) {
                const key = args[0] ? `on key "${args[0]}" ` : ``;
                console.warn(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
            }
            return type === "delete" /* DELETE */ ? false : this;
        };
    }
    const mutableInstrumentations = {
        get(key) {
            return get$1(this, key);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, false)
    };
    const shallowInstrumentations = {
        get(key) {
            return get$1(this, key, false, true);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, true)
    };
    const readonlyInstrumentations = {
        get(key) {
            return get$1(this, key, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has$1.call(this, key, true);
        },
        add: createReadonlyMethod("add" /* ADD */),
        set: createReadonlyMethod("set" /* SET */),
        delete: createReadonlyMethod("delete" /* DELETE */),
        clear: createReadonlyMethod("clear" /* CLEAR */),
        forEach: createForEach(true, false)
    };
    const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator];
    iteratorMethods.forEach(method => {
        mutableInstrumentations[method] = createIterableMethod(method, false, false);
        readonlyInstrumentations[method] = createIterableMethod(method, true, false);
        shallowInstrumentations[method] = createIterableMethod(method, false, true);
    });
    function createInstrumentationGetter(isReadonly, shallow) {
        const instrumentations = shallow
            ? shallowInstrumentations
            : isReadonly
                ? readonlyInstrumentations
                : mutableInstrumentations;
        return (target, key, receiver) => {
            if (key === "__v_isReactive" /* IS_REACTIVE */) {
                return !isReadonly;
            }
            else if (key === "__v_isReadonly" /* IS_READONLY */) {
                return isReadonly;
            }
            else if (key === "__v_raw" /* RAW */) {
                return target;
            }
            return Reflect.get(hasOwn(instrumentations, key) && key in target
                ? instrumentations
                : target, key, receiver);
        };
    }
    const mutableCollectionHandlers = {
        get: createInstrumentationGetter(false, false)
    };
    const readonlyCollectionHandlers = {
        get: createInstrumentationGetter(true, false)
    };
    function checkIdentityKeys(target, has, key) {
        const rawKey = toRaw(key);
        if (rawKey !== key && has.call(target, rawKey)) {
            const type = toRawType(target);
            console.warn(`Reactive ${type} contains both the raw and reactive ` +
                `versions of the same object${type === `Map` ? `as keys` : ``}, ` +
                `which can lead to inconsistencies. ` +
                `Avoid differentiating between the raw and reactive versions ` +
                `of an object and only use the reactive version if possible.`);
        }
    }

    const reactiveMap = new WeakMap();
    const readonlyMap = new WeakMap();
    function targetTypeMap(rawType) {
        switch (rawType) {
            case 'Object':
            case 'Array':
                return 1 /* COMMON */;
            case 'Map':
            case 'Set':
            case 'WeakMap':
            case 'WeakSet':
                return 2 /* COLLECTION */;
            default:
                return 0 /* INVALID */;
        }
    }
    function getTargetType(value) {
        return value["__v_skip" /* SKIP */] || !Object.isExtensible(value)
            ? 0 /* INVALID */
            : targetTypeMap(toRawType(value));
    }
    function reactive(target) {
        // if trying to observe a readonly proxy, return the readonly version.
        if (target && target["__v_isReadonly" /* IS_READONLY */]) {
            return target;
        }
        return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers);
    }
    function readonly(target) {
        return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers);
    }
    // Return a reactive-copy of the original object, where only the root level
    // properties are readonly, and does NOT unwrap refs nor recursively convert
    // returned properties.
    // This is used for creating the props proxy object for stateful components.
    function shallowReadonly(target) {
        return createReactiveObject(target, true, shallowReadonlyHandlers, readonlyCollectionHandlers);
    }
    function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers) {
        if (!isObject(target)) {
            if ((process.env.NODE_ENV !== 'production')) {
                console.warn(`value cannot be made reactive: ${String(target)}`);
            }
            return target;
        }
        // target is already a Proxy, return it.
        // exception: calling readonly() on a reactive object
        if (target["__v_raw" /* RAW */] &&
            !(isReadonly && target["__v_isReactive" /* IS_REACTIVE */])) {
            return target;
        }
        // target already has corresponding Proxy
        const proxyMap = isReadonly ? readonlyMap : reactiveMap;
        const existingProxy = proxyMap.get(target);
        if (existingProxy) {
            return existingProxy;
        }
        // only a whitelist of value types can be observed.
        const targetType = getTargetType(target);
        if (targetType === 0 /* INVALID */) {
            return target;
        }
        const proxy = new Proxy(target, targetType === 2 /* COLLECTION */ ? collectionHandlers : baseHandlers);
        proxyMap.set(target, proxy);
        return proxy;
    }
    function isReactive(value) {
        if (isReadonly(value)) {
            return isReactive(value["__v_raw" /* RAW */]);
        }
        return !!(value && value["__v_isReactive" /* IS_REACTIVE */]);
    }
    function isReadonly(value) {
        return !!(value && value["__v_isReadonly" /* IS_READONLY */]);
    }
    function isProxy(value) {
        return isReactive(value) || isReadonly(value);
    }
    function toRaw(observed) {
        return ((observed && toRaw(observed["__v_raw" /* RAW */])) || observed);
    }
    function isRef(r) {
        return Boolean(r && r.__v_isRef === true);
    }

    const stack = [];
    function pushWarningContext(vnode) {
        stack.push(vnode);
    }
    function popWarningContext() {
        stack.pop();
    }
    function warn(msg, ...args) {
        // avoid props formatting or warn handler tracking deps that might be mutated
        // during patch, leading to infinite recursion.
        pauseTracking();
        const instance = stack.length ? stack[stack.length - 1].component : null;
        const appWarnHandler = instance && instance.appContext.config.warnHandler;
        const trace = getComponentTrace();
        if (appWarnHandler) {
            callWithErrorHandling(appWarnHandler, instance, 11 /* APP_WARN_HANDLER */, [
                msg + args.join(''),
                instance && instance.proxy,
                trace
                    .map(({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`)
                    .join('\n'),
                trace
            ]);
        }
        else {
            const warnArgs = [`[Vue warn]: ${msg}`, ...args];
            /* istanbul ignore if */
            if (trace.length &&
                // avoid spamming console during tests
                !false) {
                warnArgs.push(`\n`, ...formatTrace(trace));
            }
            console.warn(...warnArgs);
        }
        resetTracking();
    }
    function getComponentTrace() {
        let currentVNode = stack[stack.length - 1];
        if (!currentVNode) {
            return [];
        }
        // we can't just use the stack because it will be incomplete during updates
        // that did not start from the root. Re-construct the parent chain using
        // instance parent pointers.
        const normalizedStack = [];
        while (currentVNode) {
            const last = normalizedStack[0];
            if (last && last.vnode === currentVNode) {
                last.recurseCount++;
            }
            else {
                normalizedStack.push({
                    vnode: currentVNode,
                    recurseCount: 0
                });
            }
            const parentInstance = currentVNode.component && currentVNode.component.parent;
            currentVNode = parentInstance && parentInstance.vnode;
        }
        return normalizedStack;
    }
    /* istanbul ignore next */
    function formatTrace(trace) {
        const logs = [];
        trace.forEach((entry, i) => {
            logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry));
        });
        return logs;
    }
    function formatTraceEntry({ vnode, recurseCount }) {
        const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
        const isRoot = vnode.component ? vnode.component.parent == null : false;
        const open = ` at <${formatComponentName(vnode.component, vnode.type, isRoot)}`;
        const close = `>` + postfix;
        return vnode.props
            ? [open, ...formatProps(vnode.props), close]
            : [open + close];
    }
    /* istanbul ignore next */
    function formatProps(props) {
        const res = [];
        const keys = Object.keys(props);
        keys.slice(0, 3).forEach(key => {
            res.push(...formatProp(key, props[key]));
        });
        if (keys.length > 3) {
            res.push(` ...`);
        }
        return res;
    }
    /* istanbul ignore next */
    function formatProp(key, value, raw) {
        if (isString(value)) {
            value = JSON.stringify(value);
            return raw ? value : [`${key}=${value}`];
        }
        else if (typeof value === 'number' ||
            typeof value === 'boolean' ||
            value == null) {
            return raw ? value : [`${key}=${value}`];
        }
        else if (isRef(value)) {
            value = formatProp(key, toRaw(value.value), true);
            return raw ? value : [`${key}=Ref<`, value, `>`];
        }
        else if (isFunction(value)) {
            return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
        }
        else {
            value = toRaw(value);
            return raw ? value : [`${key}=`, value];
        }
    }

    const ErrorTypeStrings = {
        ["bc" /* BEFORE_CREATE */]: 'beforeCreate hook',
        ["c" /* CREATED */]: 'created hook',
        ["bm" /* BEFORE_MOUNT */]: 'beforeMount hook',
        ["m" /* MOUNTED */]: 'mounted hook',
        ["bu" /* BEFORE_UPDATE */]: 'beforeUpdate hook',
        ["u" /* UPDATED */]: 'updated',
        ["bum" /* BEFORE_UNMOUNT */]: 'beforeUnmount hook',
        ["um" /* UNMOUNTED */]: 'unmounted hook',
        ["a" /* ACTIVATED */]: 'activated hook',
        ["da" /* DEACTIVATED */]: 'deactivated hook',
        ["ec" /* ERROR_CAPTURED */]: 'errorCaptured hook',
        ["rtc" /* RENDER_TRACKED */]: 'renderTracked hook',
        ["rtg" /* RENDER_TRIGGERED */]: 'renderTriggered hook',
        [0 /* SETUP_FUNCTION */]: 'setup function',
        [1 /* RENDER_FUNCTION */]: 'render function',
        [2 /* WATCH_GETTER */]: 'watcher getter',
        [3 /* WATCH_CALLBACK */]: 'watcher callback',
        [4 /* WATCH_CLEANUP */]: 'watcher cleanup function',
        [5 /* NATIVE_EVENT_HANDLER */]: 'native event handler',
        [6 /* COMPONENT_EVENT_HANDLER */]: 'component event handler',
        [7 /* VNODE_HOOK */]: 'vnode hook',
        [8 /* DIRECTIVE_HOOK */]: 'directive hook',
        [9 /* TRANSITION_HOOK */]: 'transition hook',
        [10 /* APP_ERROR_HANDLER */]: 'app errorHandler',
        [11 /* APP_WARN_HANDLER */]: 'app warnHandler',
        [12 /* FUNCTION_REF */]: 'ref function',
        [13 /* ASYNC_COMPONENT_LOADER */]: 'async component loader',
        [14 /* SCHEDULER */]: 'scheduler flush. This is likely a Vue internals bug. ' +
            'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/vue-next'
    };
    function callWithErrorHandling(fn, instance, type, args) {
        let res;
        try {
            res = args ? fn(...args) : fn();
        }
        catch (err) {
            handleError(err, instance, type);
        }
        return res;
    }
    function callWithAsyncErrorHandling(fn, instance, type, args) {
        if (isFunction(fn)) {
            const res = callWithErrorHandling(fn, instance, type, args);
            if (res && isPromise(res)) {
                res.catch(err => {
                    handleError(err, instance, type);
                });
            }
            return res;
        }
        const values = [];
        for (let i = 0; i < fn.length; i++) {
            values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
        }
        return values;
    }
    function handleError(err, instance, type, throwInDev = true) {
        const contextVNode = instance ? instance.vnode : null;
        if (instance) {
            let cur = instance.parent;
            // the exposed instance is the render proxy to keep it consistent with 2.x
            const exposedInstance = instance.proxy;
            // in production the hook receives only the error code
            const errorInfo = (process.env.NODE_ENV !== 'production') ? ErrorTypeStrings[type] : type;
            while (cur) {
                const errorCapturedHooks = cur.ec;
                if (errorCapturedHooks) {
                    for (let i = 0; i < errorCapturedHooks.length; i++) {
                        if (errorCapturedHooks[i](err, exposedInstance, errorInfo)) {
                            return;
                        }
                    }
                }
                cur = cur.parent;
            }
            // app-level handling
            const appErrorHandler = instance.appContext.config.errorHandler;
            if (appErrorHandler) {
                callWithErrorHandling(appErrorHandler, null, 10 /* APP_ERROR_HANDLER */, [err, exposedInstance, errorInfo]);
                return;
            }
        }
        logError(err, type, contextVNode, throwInDev);
    }
    function logError(err, type, contextVNode, throwInDev = true) {
        if ((process.env.NODE_ENV !== 'production')) {
            const info = ErrorTypeStrings[type];
            if (contextVNode) {
                pushWarningContext(contextVNode);
            }
            warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`);
            if (contextVNode) {
                popWarningContext();
            }
            // crash in dev by default so it's more noticeable
            if (throwInDev) {
                throw err;
            }
            else {
                console.error(err);
            }
        }
        else {
            // recover in prod to reduce the impact on end-user
            console.error(err);
        }
    }

    let isFlushing = false;
    let isFlushPending = false;
    const queue = [];
    let flushIndex = 0;
    const pendingPreFlushCbs = [];
    let activePreFlushCbs = null;
    let preFlushIndex = 0;
    const pendingPostFlushCbs = [];
    let activePostFlushCbs = null;
    let postFlushIndex = 0;
    const resolvedPromise = Promise.resolve();
    let currentFlushPromise = null;
    let currentPreFlushParentJob = null;
    const RECURSION_LIMIT = 100;
    function nextTick(fn) {
        const p = currentFlushPromise || resolvedPromise;
        return fn ? p.then(fn) : p;
    }
    function queueJob(job) {
        // the dedupe search uses the startIndex argument of Array.includes()
        // by default the search index includes the current job that is being run
        // so it cannot recursively trigger itself again.
        // if the job is a watch() callback, the search will start with a +1 index to
        // allow it recursively trigger itself - it is the user's responsibility to
        // ensure it doesn't end up in an infinite loop.
        if ((!queue.length ||
            !queue.includes(job, isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)) &&
            job !== currentPreFlushParentJob) {
            queue.push(job);
            queueFlush();
        }
    }
    function queueFlush() {
        if (!isFlushing && !isFlushPending) {
            isFlushPending = true;
            currentFlushPromise = resolvedPromise.then(flushJobs);
        }
    }
    function queueCb(cb, activeQueue, pendingQueue, index) {
        if (!isArray(cb)) {
            if (!activeQueue ||
                !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)) {
                pendingQueue.push(cb);
            }
        }
        else {
            // if cb is an array, it is a component lifecycle hook which can only be
            // triggered by a job, which is already deduped in the main queue, so
            // we can skip duplicate check here to improve perf
            pendingQueue.push(...cb);
        }
        queueFlush();
    }
    function queuePreFlushCb(cb) {
        queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
    }
    function queuePostFlushCb(cb) {
        queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
    }
    function flushPreFlushCbs(seen, parentJob = null) {
        if (pendingPreFlushCbs.length) {
            currentPreFlushParentJob = parentJob;
            activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
            pendingPreFlushCbs.length = 0;
            if ((process.env.NODE_ENV !== 'production')) {
                seen = seen || new Map();
            }
            for (preFlushIndex = 0; preFlushIndex < activePreFlushCbs.length; preFlushIndex++) {
                if ((process.env.NODE_ENV !== 'production')) {
                    checkRecursiveUpdates(seen, activePreFlushCbs[preFlushIndex]);
                }
                activePreFlushCbs[preFlushIndex]();
            }
            activePreFlushCbs = null;
            preFlushIndex = 0;
            currentPreFlushParentJob = null;
            // recursively flush until it drains
            flushPreFlushCbs(seen, parentJob);
        }
    }
    function flushPostFlushCbs(seen) {
        if (pendingPostFlushCbs.length) {
            const deduped = [...new Set(pendingPostFlushCbs)];
            pendingPostFlushCbs.length = 0;
            // #1947 already has active queue, nested flushPostFlushCbs call
            if (activePostFlushCbs) {
                activePostFlushCbs.push(...deduped);
                return;
            }
            activePostFlushCbs = deduped;
            if ((process.env.NODE_ENV !== 'production')) {
                seen = seen || new Map();
            }
            activePostFlushCbs.sort((a, b) => getId(a) - getId(b));
            for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
                if ((process.env.NODE_ENV !== 'production')) {
                    checkRecursiveUpdates(seen, activePostFlushCbs[postFlushIndex]);
                }
                activePostFlushCbs[postFlushIndex]();
            }
            activePostFlushCbs = null;
            postFlushIndex = 0;
        }
    }
    const getId = (job) => job.id == null ? Infinity : job.id;
    function flushJobs(seen) {
        isFlushPending = false;
        isFlushing = true;
        if ((process.env.NODE_ENV !== 'production')) {
            seen = seen || new Map();
        }
        flushPreFlushCbs(seen);
        // Sort queue before flush.
        // This ensures that:
        // 1. Components are updated from parent to child. (because parent is always
        //    created before the child so its render effect will have smaller
        //    priority number)
        // 2. If a component is unmounted during a parent component's update,
        //    its update can be skipped.
        // Jobs can never be null before flush starts, since they are only invalidated
        // during execution of another flushed job.
        queue.sort((a, b) => getId(a) - getId(b));
        try {
            for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
                const job = queue[flushIndex];
                if (job) {
                    if ((process.env.NODE_ENV !== 'production')) {
                        checkRecursiveUpdates(seen, job);
                    }
                    callWithErrorHandling(job, null, 14 /* SCHEDULER */);
                }
            }
        }
        finally {
            flushIndex = 0;
            queue.length = 0;
            flushPostFlushCbs(seen);
            isFlushing = false;
            currentFlushPromise = null;
            // some postFlushCb queued jobs!
            // keep flushing until it drains.
            if (queue.length || pendingPostFlushCbs.length) {
                flushJobs(seen);
            }
        }
    }
    function checkRecursiveUpdates(seen, fn) {
        if (!seen.has(fn)) {
            seen.set(fn, 1);
        }
        else {
            const count = seen.get(fn);
            if (count > RECURSION_LIMIT) {
                throw new Error(`Maximum recursive updates exceeded. ` +
                    `This means you have a reactive effect that is mutating its own ` +
                    `dependencies and thus recursively triggering itself. Possible sources ` +
                    `include component template, render function, updated hook or ` +
                    `watcher source function.`);
            }
            else {
                seen.set(fn, count + 1);
            }
        }
    }
    const hmrDirtyComponents = new Set();
    // Expose the HMR runtime on the global object
    // This makes it entirely tree-shakable without polluting the exports and makes
    // it easier to be used in toolings like vue-loader
    // Note: for a component to be eligible for HMR it also needs the __hmrId option
    // to be set so that its instances can be registered / removed.
    if ((process.env.NODE_ENV !== 'production')) {
        const globalObject = typeof global !== 'undefined'
            ? global
            : typeof self !== 'undefined'
                ? self
                : typeof window !== 'undefined'
                    ? window
                    : {};
        globalObject.__VUE_HMR_RUNTIME__ = {
            createRecord: tryWrap(createRecord),
            rerender: tryWrap(rerender),
            reload: tryWrap(reload)
        };
    }
    const map = new Map();
    function createRecord(id) {
        if (map.has(id)) {
            return false;
        }
        map.set(id, new Set());
        return true;
    }
    function rerender(id, newRender) {
        const record = map.get(id);
        if (!record)
            return;
        // Array.from creates a snapshot which avoids the set being mutated during
        // updates
        Array.from(record).forEach(instance => {
            if (newRender) {
                instance.render = newRender;
            }
            instance.renderCache = [];
            instance.update();
        });
    }
    function reload(id, newComp) {
        const record = map.get(id);
        if (!record)
            return;
        // Array.from creates a snapshot which avoids the set being mutated during
        // updates
        Array.from(record).forEach(instance => {
            const comp = instance.type;
            if (!hmrDirtyComponents.has(comp)) {
                // 1. Update existing comp definition to match new one
                newComp = isClassComponent(newComp) ? newComp.__vccOpts : newComp;
                extend(comp, newComp);
                for (const key in comp) {
                    if (!(key in newComp)) {
                        delete comp[key];
                    }
                }
                // 2. Mark component dirty. This forces the renderer to replace the component
                // on patch.
                hmrDirtyComponents.add(comp);
                // 3. Make sure to unmark the component after the reload.
                queuePostFlushCb(() => {
                    hmrDirtyComponents.delete(comp);
                });
            }
            if (instance.parent) {
                // 4. Force the parent instance to re-render. This will cause all updated
                // components to be unmounted and re-mounted. Queue the update so that we
                // don't end up forcing the same parent to re-render multiple times.
                queueJob(instance.parent.update);
            }
            else if (instance.appContext.reload) {
                // root instance mounted via createApp() has a reload method
                instance.appContext.reload();
            }
            else if (typeof window !== 'undefined') {
                // root instance inside tree created via raw render(). Force reload.
                window.location.reload();
            }
            else {
                console.warn('[HMR] Root or manually mounted instance modified. Full reload required.');
            }
        });
    }
    function tryWrap(fn) {
        return (id, arg) => {
            try {
                return fn(id, arg);
            }
            catch (e) {
                console.error(e);
                console.warn(`[HMR] Something went wrong during Vue component hot-reload. ` +
                    `Full reload required.`);
            }
        };
    }
    function setDevtoolsHook(hook) {
    }

    // mark the current rendering instance for asset resolution (e.g.
    // resolveComponent, resolveDirective) during render
    let currentRenderingInstance = null;
    function markAttrsAccessed() {
    }
    /**
     * dev only
     */
    function filterSingleRoot(children) {
        const filtered = children.filter(child => {
            return !(isVNode(child) &&
                child.type === Comment &&
                child.children !== 'v-if');
        });
        return filtered.length === 1 && isVNode(filtered[0]) ? filtered[0] : null;
    }

    const isSuspense = (type) => type.__isSuspense;
    function normalizeSuspenseChildren(vnode) {
        const { shapeFlag, children } = vnode;
        let content;
        let fallback;
        if (shapeFlag & 32 /* SLOTS_CHILDREN */) {
            content = normalizeSuspenseSlot(children.default);
            fallback = normalizeSuspenseSlot(children.fallback);
        }
        else {
            content = normalizeSuspenseSlot(children);
            fallback = normalizeVNode(null);
        }
        return {
            content,
            fallback
        };
    }
    function normalizeSuspenseSlot(s) {
        if (isFunction(s)) {
            s = s();
        }
        if (isArray(s)) {
            const singleChild = filterSingleRoot(s);
            if ((process.env.NODE_ENV !== 'production') && !singleChild) {
                warn(`<Suspense> slots expect a single root node.`);
            }
            s = singleChild;
        }
        return normalizeVNode(s);
    }
    function queueEffectWithSuspense(fn, suspense) {
        if (suspense && suspense.pendingBranch) {
            if (isArray(fn)) {
                suspense.effects.push(...fn);
            }
            else {
                suspense.effects.push(fn);
            }
        }
        else {
            queuePostFlushCb(fn);
        }
    }

    let isRenderingCompiledSlot = 0;
    const setCompiledSlotRendering = (n) => (isRenderingCompiledSlot += n);

    // SFC scoped style ID management.
    let currentScopeId = null;

    const isTeleport = (type) => type.__isTeleport;
    const NULL_DYNAMIC_COMPONENT = Symbol();

    const Fragment = Symbol((process.env.NODE_ENV !== 'production') ? 'Fragment' : undefined);
    const Text = Symbol((process.env.NODE_ENV !== 'production') ? 'Text' : undefined);
    const Comment = Symbol((process.env.NODE_ENV !== 'production') ? 'Comment' : undefined);
    const Static = Symbol((process.env.NODE_ENV !== 'production') ? 'Static' : undefined);
    let currentBlock = null;
    function isVNode(value) {
        return value ? value.__v_isVNode === true : false;
    }
    const createVNodeWithArgsTransform = (...args) => {
        return _createVNode(...( args));
    };
    const InternalObjectKey = `__vInternal`;
    const normalizeKey = ({ key }) => key != null ? key : null;
    const normalizeRef = ({ ref }) => {
        return (ref != null
            ? isArray(ref)
                ? ref
                : { i: currentRenderingInstance, r: ref }
            : null);
    };
    const createVNode = ((process.env.NODE_ENV !== 'production')
        ? createVNodeWithArgsTransform
        : _createVNode);
    function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
        if (!type || type === NULL_DYNAMIC_COMPONENT) {
            if ((process.env.NODE_ENV !== 'production') && !type) {
                warn(`Invalid vnode type when creating vnode: ${type}.`);
            }
            type = Comment;
        }
        if (isVNode(type)) {
            // createVNode receiving an existing vnode. This happens in cases like
            // <component :is="vnode"/>
            // #2078 make sure to merge refs during the clone instead of overwriting it
            const cloned = cloneVNode(type, props, true /* mergeRef: true */);
            if (children) {
                normalizeChildren(cloned, children);
            }
            return cloned;
        }
        // class component normalization.
        if (isClassComponent(type)) {
            type = type.__vccOpts;
        }
        // class & style normalization.
        if (props) {
            // for reactive or proxy objects, we need to clone it to enable mutation.
            if (isProxy(props) || InternalObjectKey in props) {
                props = extend({}, props);
            }
            let { class: klass, style } = props;
            if (klass && !isString(klass)) {
                props.class = normalizeClass(klass);
            }
            if (isObject(style)) {
                // reactive state objects need to be cloned since they are likely to be
                // mutated
                if (isProxy(style) && !isArray(style)) {
                    style = extend({}, style);
                }
                props.style = normalizeStyle(style);
            }
        }
        // encode the vnode type information into a bitmap
        const shapeFlag = isString(type)
            ? 1 /* ELEMENT */
            :  isSuspense(type)
                ? 128 /* SUSPENSE */
                : isTeleport(type)
                    ? 64 /* TELEPORT */
                    : isObject(type)
                        ? 4 /* STATEFUL_COMPONENT */
                        : isFunction(type)
                            ? 2 /* FUNCTIONAL_COMPONENT */
                            : 0;
        if ((process.env.NODE_ENV !== 'production') && shapeFlag & 4 /* STATEFUL_COMPONENT */ && isProxy(type)) {
            type = toRaw(type);
            warn(`Vue received a Component which was made a reactive object. This can ` +
                `lead to unnecessary performance overhead, and should be avoided by ` +
                `marking the component with \`markRaw\` or using \`shallowRef\` ` +
                `instead of \`ref\`.`, `\nComponent that was made reactive: `, type);
        }
        const vnode = {
            __v_isVNode: true,
            ["__v_skip" /* SKIP */]: true,
            type,
            props,
            key: props && normalizeKey(props),
            ref: props && normalizeRef(props),
            scopeId: currentScopeId,
            children: null,
            component: null,
            suspense: null,
            ssContent: null,
            ssFallback: null,
            dirs: null,
            transition: null,
            el: null,
            anchor: null,
            target: null,
            targetAnchor: null,
            staticCount: 0,
            shapeFlag,
            patchFlag,
            dynamicProps,
            dynamicChildren: null,
            appContext: null
        };
        // validate key
        if ((process.env.NODE_ENV !== 'production') && vnode.key !== vnode.key) {
            warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
        }
        normalizeChildren(vnode, children);
        // normalize suspense children
        if ( shapeFlag & 128 /* SUSPENSE */) {
            const { content, fallback } = normalizeSuspenseChildren(vnode);
            vnode.ssContent = content;
            vnode.ssFallback = fallback;
        }
        if (
            // avoid a block node from tracking itself
            !isBlockNode &&
            // has current parent block
            currentBlock &&
            // presence of a patch flag indicates this node needs patching on updates.
            // component nodes also should always be patched, because even if the
            // component doesn't need to update, it needs to persist the instance on to
            // the next vnode so that it can be properly unmounted later.
            (patchFlag > 0 || shapeFlag & 6 /* COMPONENT */) &&
            // the EVENTS flag is only for hydration and if it is the only flag, the
            // vnode should not be considered dynamic due to handler caching.
            patchFlag !== 32 /* HYDRATE_EVENTS */) {
            currentBlock.push(vnode);
        }
        return vnode;
    }
    function cloneVNode(vnode, extraProps, mergeRef = false) {
        // This is intentionally NOT using spread or extend to avoid the runtime
        // key enumeration cost.
        const { props, ref, patchFlag } = vnode;
        const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
        return {
            __v_isVNode: true,
            ["__v_skip" /* SKIP */]: true,
            type: vnode.type,
            props: mergedProps,
            key: mergedProps && normalizeKey(mergedProps),
            ref: extraProps && extraProps.ref
                ? // #2078 in the case of <component :is="vnode" ref="extra"/>
                    // if the vnode itself already has a ref, cloneVNode will need to merge
                    // the refs so the single vnode can be set on multiple refs
                    mergeRef && ref
                        ? isArray(ref)
                            ? ref.concat(normalizeRef(extraProps))
                            : [ref, normalizeRef(extraProps)]
                        : normalizeRef(extraProps)
                : ref,
            scopeId: vnode.scopeId,
            children: vnode.children,
            target: vnode.target,
            targetAnchor: vnode.targetAnchor,
            staticCount: vnode.staticCount,
            shapeFlag: vnode.shapeFlag,
            // if the vnode is cloned with extra props, we can no longer assume its
            // existing patch flag to be reliable and need to add the FULL_PROPS flag.
            // note: perserve flag for fragments since they use the flag for children
            // fast paths only.
            patchFlag: extraProps && vnode.type !== Fragment
                ? patchFlag === -1 // hoisted node
                    ? 16 /* FULL_PROPS */
                    : patchFlag | 16 /* FULL_PROPS */
                : patchFlag,
            dynamicProps: vnode.dynamicProps,
            dynamicChildren: vnode.dynamicChildren,
            appContext: vnode.appContext,
            dirs: vnode.dirs,
            transition: vnode.transition,
            // These should technically only be non-null on mounted VNodes. However,
            // they *should* be copied for kept-alive vnodes. So we just always copy
            // them since them being non-null during a mount doesn't affect the logic as
            // they will simply be overwritten.
            component: vnode.component,
            suspense: vnode.suspense,
            ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
            ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
            el: vnode.el,
            anchor: vnode.anchor
        };
    }
    /**
     * @private
     */
    function createTextVNode(text = ' ', flag = 0) {
        return createVNode(Text, null, text, flag);
    }
    function normalizeVNode(child) {
        if (child == null || typeof child === 'boolean') {
            // empty placeholder
            return createVNode(Comment);
        }
        else if (isArray(child)) {
            // fragment
            return createVNode(Fragment, null, child);
        }
        else if (typeof child === 'object') {
            // already vnode, this should be the most common since compiled templates
            // always produce all-vnode children arrays
            return child.el === null ? child : cloneVNode(child);
        }
        else {
            // strings and numbers
            return createVNode(Text, null, String(child));
        }
    }
    function normalizeChildren(vnode, children) {
        let type = 0;
        const { shapeFlag } = vnode;
        if (children == null) {
            children = null;
        }
        else if (isArray(children)) {
            type = 16 /* ARRAY_CHILDREN */;
        }
        else if (typeof children === 'object') {
            if (shapeFlag & 1 /* ELEMENT */ || shapeFlag & 64 /* TELEPORT */) {
                // Normalize slot to plain children for plain element and Teleport
                const slot = children.default;
                if (slot) {
                    // _c marker is added by withCtx() indicating this is a compiled slot
                    slot._c && setCompiledSlotRendering(1);
                    normalizeChildren(vnode, slot());
                    slot._c && setCompiledSlotRendering(-1);
                }
                return;
            }
            else {
                type = 32 /* SLOTS_CHILDREN */;
                const slotFlag = children._;
                if (!slotFlag && !(InternalObjectKey in children)) {
                    children._ctx = currentRenderingInstance;
                }
                else if (slotFlag === 3 /* FORWARDED */ && currentRenderingInstance) {
                    // a child component receives forwarded slots from the parent.
                    // its slot type is determined by its parent's slot type.
                    if (currentRenderingInstance.vnode.patchFlag & 1024 /* DYNAMIC_SLOTS */) {
                        children._ = 2 /* DYNAMIC */;
                        vnode.patchFlag |= 1024 /* DYNAMIC_SLOTS */;
                    }
                    else {
                        children._ = 1 /* STABLE */;
                    }
                }
            }
        }
        else if (isFunction(children)) {
            children = { default: children, _ctx: currentRenderingInstance };
            type = 32 /* SLOTS_CHILDREN */;
        }
        else {
            children = String(children);
            // force teleport children to array so it can be moved around
            if (shapeFlag & 64 /* TELEPORT */) {
                type = 16 /* ARRAY_CHILDREN */;
                children = [createTextVNode(children)];
            }
            else {
                type = 8 /* TEXT_CHILDREN */;
            }
        }
        vnode.children = children;
        vnode.shapeFlag |= type;
    }
    function mergeProps(...args) {
        const ret = extend({}, args[0]);
        for (let i = 1; i < args.length; i++) {
            const toMerge = args[i];
            for (const key in toMerge) {
                if (key === 'class') {
                    if (ret.class !== toMerge.class) {
                        ret.class = normalizeClass([ret.class, toMerge.class]);
                    }
                }
                else if (key === 'style') {
                    ret.style = normalizeStyle([ret.style, toMerge.style]);
                }
                else if (isOn(key)) {
                    const existing = ret[key];
                    const incoming = toMerge[key];
                    if (existing !== incoming) {
                        ret[key] = existing
                            ? [].concat(existing, toMerge[key])
                            : incoming;
                    }
                }
                else {
                    ret[key] = toMerge[key];
                }
            }
        }
        return ret;
    }
    const queuePostRenderEffect =  queueEffectWithSuspense
        ;
    // initial value for watchers to trigger on undefined initial values
    const INITIAL_WATCHER_VALUE = {};
    function doWatch(source, cb, { immediate, deep, flush, onTrack, onTrigger } = EMPTY_OBJ, instance = currentInstance) {
        if ((process.env.NODE_ENV !== 'production') && !cb) {
            if (immediate !== undefined) {
                warn(`watch() "immediate" option is only respected when using the ` +
                    `watch(source, callback, options?) signature.`);
            }
            if (deep !== undefined) {
                warn(`watch() "deep" option is only respected when using the ` +
                    `watch(source, callback, options?) signature.`);
            }
        }
        const warnInvalidSource = (s) => {
            warn(`Invalid watch source: `, s, `A watch source can only be a getter/effect function, a ref, ` +
                `a reactive object, or an array of these types.`);
        };
        let getter;
        const isRefSource = isRef(source);
        if (isRefSource) {
            getter = () => source.value;
        }
        else if (isReactive(source)) {
            getter = () => source;
            deep = true;
        }
        else if (isArray(source)) {
            getter = () => source.map(s => {
                if (isRef(s)) {
                    return s.value;
                }
                else if (isReactive(s)) {
                    return traverse(s);
                }
                else if (isFunction(s)) {
                    return callWithErrorHandling(s, instance, 2 /* WATCH_GETTER */);
                }
                else {
                    (process.env.NODE_ENV !== 'production') && warnInvalidSource(s);
                }
            });
        }
        else if (isFunction(source)) {
            if (cb) {
                // getter with cb
                getter = () => callWithErrorHandling(source, instance, 2 /* WATCH_GETTER */);
            }
            else {
                // no cb -> simple effect
                getter = () => {
                    if (instance && instance.isUnmounted) {
                        return;
                    }
                    if (cleanup) {
                        cleanup();
                    }
                    return callWithErrorHandling(source, instance, 3 /* WATCH_CALLBACK */, [onInvalidate]);
                };
            }
        }
        else {
            getter = NOOP;
            (process.env.NODE_ENV !== 'production') && warnInvalidSource(source);
        }
        if (cb && deep) {
            const baseGetter = getter;
            getter = () => traverse(baseGetter());
        }
        let cleanup;
        const onInvalidate = (fn) => {
            cleanup = runner.options.onStop = () => {
                callWithErrorHandling(fn, instance, 4 /* WATCH_CLEANUP */);
            };
        };
        let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE;
        const job = () => {
            if (!runner.active) {
                return;
            }
            if (cb) {
                // watch(source, cb)
                const newValue = runner();
                if (deep || isRefSource || hasChanged(newValue, oldValue)) {
                    // cleanup before running cb again
                    if (cleanup) {
                        cleanup();
                    }
                    callWithAsyncErrorHandling(cb, instance, 3 /* WATCH_CALLBACK */, [
                        newValue,
                        // pass undefined as the old value when it's changed for the first time
                        oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
                        onInvalidate
                    ]);
                    oldValue = newValue;
                }
            }
            else {
                // watchEffect
                runner();
            }
        };
        // important: mark the job as a watcher callback so that scheduler knows it
        // it is allowed to self-trigger (#1727)
        job.allowRecurse = !!cb;
        let scheduler;
        if (flush === 'sync') {
            scheduler = job;
        }
        else if (flush === 'post') {
            scheduler = () => queuePostRenderEffect(job, instance && instance.suspense);
        }
        else {
            // default: 'pre'
            scheduler = () => {
                if (!instance || instance.isMounted) {
                    queuePreFlushCb(job);
                }
                else {
                    // with 'pre' option, the first call must happen before
                    // the component is mounted so it is called synchronously.
                    job();
                }
            };
        }
        const runner = effect(getter, {
            lazy: true,
            onTrack,
            onTrigger,
            scheduler
        });
        // initial run
        if (cb) {
            if (immediate) {
                job();
            }
            else {
                oldValue = runner();
            }
        }
        else if (flush === 'post') {
            queuePostRenderEffect(runner, instance && instance.suspense);
        }
        else {
            runner();
        }
        return () => {
            stop(runner);
            if (instance) {
                remove(instance.effects, runner);
            }
        };
    }
    // this.$watch
    function instanceWatch(source, cb, options) {
        const publicThis = this.proxy;
        const getter = isString(source)
            ? () => publicThis[source]
            : source.bind(publicThis);
        return doWatch(getter, cb.bind(publicThis), options, this);
    }
    function traverse(value, seen = new Set()) {
        if (!isObject(value) || seen.has(value)) {
            return value;
        }
        seen.add(value);
        if (isRef(value)) {
            traverse(value.value, seen);
        }
        else if (isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                traverse(value[i], seen);
            }
        }
        else if (isMap(value)) {
            value.forEach((_, key) => {
                // to register mutation dep for existing keys
                traverse(value.get(key), seen);
            });
        }
        else if (isSet(value)) {
            value.forEach(v => {
                traverse(v, seen);
            });
        }
        else {
            for (const key in value) {
                traverse(value[key], seen);
            }
        }
        return value;
    }
    let isInBeforeCreate = false;
    function resolveMergedOptions(instance) {
        const raw = instance.type;
        const { __merged, mixins, extends: extendsOptions } = raw;
        if (__merged)
            return __merged;
        const globalMixins = instance.appContext.mixins;
        if (!globalMixins.length && !mixins && !extendsOptions)
            return raw;
        const options = {};
        globalMixins.forEach(m => mergeOptions(options, m, instance));
        mergeOptions(options, raw, instance);
        return (raw.__merged = options);
    }
    function mergeOptions(to, from, instance) {
        const strats = instance.appContext.config.optionMergeStrategies;
        const { mixins, extends: extendsOptions } = from;
        extendsOptions && mergeOptions(to, extendsOptions, instance);
        mixins &&
            mixins.forEach((m) => mergeOptions(to, m, instance));
        for (const key in from) {
            if (strats && hasOwn(strats, key)) {
                to[key] = strats[key](to[key], from[key], instance.proxy, key);
            }
            else {
                to[key] = from[key];
            }
        }
    }

    const publicPropertiesMap = extend(Object.create(null), {
        $: i => i,
        $el: i => i.vnode.el,
        $data: i => i.data,
        $props: i => ((process.env.NODE_ENV !== 'production') ? shallowReadonly(i.props) : i.props),
        $attrs: i => ((process.env.NODE_ENV !== 'production') ? shallowReadonly(i.attrs) : i.attrs),
        $slots: i => ((process.env.NODE_ENV !== 'production') ? shallowReadonly(i.slots) : i.slots),
        $refs: i => ((process.env.NODE_ENV !== 'production') ? shallowReadonly(i.refs) : i.refs),
        $parent: i => i.parent && i.parent.proxy,
        $root: i => i.root && i.root.proxy,
        $emit: i => i.emit,
        $options: i => (__VUE_OPTIONS_API__ ? resolveMergedOptions(i) : i.type),
        $forceUpdate: i => () => queueJob(i.update),
        $nextTick: () => nextTick,
        $watch: i => (__VUE_OPTIONS_API__ ? instanceWatch.bind(i) : NOOP)
    });
    const PublicInstanceProxyHandlers = {
        get({ _: instance }, key) {
            const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
            // let @vue/reactivity know it should never observe Vue public instances.
            if (key === "__v_skip" /* SKIP */) {
                return true;
            }
            // data / props / ctx
            // This getter gets called for every property access on the render context
            // during render and is a major hotspot. The most expensive part of this
            // is the multiple hasOwn() calls. It's much faster to do a simple property
            // access on a plain object, so we use an accessCache object (with null
            // prototype) to memoize what access type a key corresponds to.
            let normalizedProps;
            if (key[0] !== '$') {
                const n = accessCache[key];
                if (n !== undefined) {
                    switch (n) {
                        case 0 /* SETUP */:
                            return setupState[key];
                        case 1 /* DATA */:
                            return data[key];
                        case 3 /* CONTEXT */:
                            return ctx[key];
                        case 2 /* PROPS */:
                            return props[key];
                        // default: just fallthrough
                    }
                }
                else if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
                    accessCache[key] = 0 /* SETUP */;
                    return setupState[key];
                }
                else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
                    accessCache[key] = 1 /* DATA */;
                    return data[key];
                }
                else if (
                // only cache other properties when instance has declared (thus stable)
                // props
                (normalizedProps = instance.propsOptions[0]) &&
                    hasOwn(normalizedProps, key)) {
                    accessCache[key] = 2 /* PROPS */;
                    return props[key];
                }
                else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
                    accessCache[key] = 3 /* CONTEXT */;
                    return ctx[key];
                }
                else if (!__VUE_OPTIONS_API__ || !isInBeforeCreate) {
                    accessCache[key] = 4 /* OTHER */;
                }
            }
            const publicGetter = publicPropertiesMap[key];
            let cssModule, globalProperties;
            // public $xxx properties
            if (publicGetter) {
                if (key === '$attrs') {
                    track(instance, "get" /* GET */, key);
                    (process.env.NODE_ENV !== 'production') && markAttrsAccessed();
                }
                return publicGetter(instance);
            }
            else if (
            // css module (injected by vue-loader)
            (cssModule = type.__cssModules) &&
                (cssModule = cssModule[key])) {
                return cssModule;
            }
            else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
                // user may set custom properties to `this` that start with `$`
                accessCache[key] = 3 /* CONTEXT */;
                return ctx[key];
            }
            else if (
            // global properties
            ((globalProperties = appContext.config.globalProperties),
                hasOwn(globalProperties, key))) {
                return globalProperties[key];
            }
            else if ((process.env.NODE_ENV !== 'production') &&
                currentRenderingInstance &&
                (!isString(key) ||
                    // #1091 avoid internal isRef/isVNode checks on component instance leading
                    // to infinite warning loop
                    key.indexOf('__v') !== 0)) {
                if (data !== EMPTY_OBJ &&
                    (key[0] === '$' || key[0] === '_') &&
                    hasOwn(data, key)) {
                    warn(`Property ${JSON.stringify(key)} must be accessed via $data because it starts with a reserved ` +
                        `character ("$" or "_") and is not proxied on the render context.`);
                }
                else {
                    warn(`Property ${JSON.stringify(key)} was accessed during render ` +
                        `but is not defined on instance.`);
                }
            }
        },
        set({ _: instance }, key, value) {
            const { data, setupState, ctx } = instance;
            if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
                setupState[key] = value;
            }
            else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
                data[key] = value;
            }
            else if (key in instance.props) {
                (process.env.NODE_ENV !== 'production') &&
                    warn(`Attempting to mutate prop "${key}". Props are readonly.`, instance);
                return false;
            }
            if (key[0] === '$' && key.slice(1) in instance) {
                (process.env.NODE_ENV !== 'production') &&
                    warn(`Attempting to mutate public property "${key}". ` +
                        `Properties starting with $ are reserved and readonly.`, instance);
                return false;
            }
            else {
                if ((process.env.NODE_ENV !== 'production') && key in instance.appContext.config.globalProperties) {
                    Object.defineProperty(ctx, key, {
                        enumerable: true,
                        configurable: true,
                        value
                    });
                }
                else {
                    ctx[key] = value;
                }
            }
            return true;
        },
        has({ _: { data, setupState, accessCache, ctx, appContext, propsOptions } }, key) {
            let normalizedProps;
            return (accessCache[key] !== undefined ||
                (data !== EMPTY_OBJ && hasOwn(data, key)) ||
                (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) ||
                ((normalizedProps = propsOptions[0]) && hasOwn(normalizedProps, key)) ||
                hasOwn(ctx, key) ||
                hasOwn(publicPropertiesMap, key) ||
                hasOwn(appContext.config.globalProperties, key));
        }
    };
    if ((process.env.NODE_ENV !== 'production') && !false) {
        PublicInstanceProxyHandlers.ownKeys = (target) => {
            warn(`Avoid app logic that relies on enumerating keys on a component instance. ` +
                `The keys will be empty in production mode to avoid performance overhead.`);
            return Reflect.ownKeys(target);
        };
    }
    const RuntimeCompiledPublicInstanceProxyHandlers = extend({}, PublicInstanceProxyHandlers, {
        get(target, key) {
            // fast path for unscopables when using `with` block
            if (key === Symbol.unscopables) {
                return;
            }
            return PublicInstanceProxyHandlers.get(target, key, target);
        },
        has(_, key) {
            const has = key[0] !== '_' && !isGloballyWhitelisted(key);
            if ((process.env.NODE_ENV !== 'production') && !has && PublicInstanceProxyHandlers.has(_, key)) {
                warn(`Property ${JSON.stringify(key)} should not start with _ which is a reserved prefix for Vue internals.`);
            }
            return has;
        }
    });
    let currentInstance = null;
    const classifyRE = /(?:^|[-_])(\w)/g;
    const classify = (str) => str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '');
    /* istanbul ignore next */
    function formatComponentName(instance, Component, isRoot = false) {
        let name = isFunction(Component)
            ? Component.displayName || Component.name
            : Component.name;
        if (!name && Component.__file) {
            const match = Component.__file.match(/([^/\\]+)\.vue$/);
            if (match) {
                name = match[1];
            }
        }
        if (!name && instance && instance.parent) {
            // try to infer the name based on reverse resolution
            const inferFromRegistry = (registry) => {
                for (const key in registry) {
                    if (registry[key] === Component) {
                        return key;
                    }
                }
            };
            name =
                inferFromRegistry(instance.components ||
                    instance.parent.type.components) || inferFromRegistry(instance.appContext.components);
        }
        return name ? classify(name) : isRoot ? `App` : `Anonymous`;
    }
    function isClassComponent(value) {
        return isFunction(value) && '__vccOpts' in value;
    }

    // Actual implementation
    function h(type, propsOrChildren, children) {
        const l = arguments.length;
        if (l === 2) {
            if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
                // single vnode without props
                if (isVNode(propsOrChildren)) {
                    return createVNode(type, null, [propsOrChildren]);
                }
                // props without children
                return createVNode(type, propsOrChildren);
            }
            else {
                // omit props
                return createVNode(type, null, propsOrChildren);
            }
        }
        else {
            if (l > 3) {
                children = Array.prototype.slice.call(arguments, 2);
            }
            else if (l === 3 && isVNode(children)) {
                children = [children];
            }
            return createVNode(type, propsOrChildren, children);
        }
    }

    const ssrContextKey = Symbol((process.env.NODE_ENV !== 'production') ? `ssrContext` : ``);

    function initDev() {
        const target = getGlobalThis();
        target.__VUE__ = true;
        setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__);
        {
            console.info(`You are running a development build of Vue.\n` +
                `Make sure to use the production build (*.prod.js) when deploying for production.`);
        }
    }

    // This entry exports the runtime only, and is built as
    (process.env.NODE_ENV !== 'production') && initDev();

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var ramjet_umd = createCommonjsModule(function (module, exports) {
    (function (global, factory) {
                 factory(exports) ;
    }(commonjsGlobal, function (exports) {
                var babelHelpers = {};

                babelHelpers.classCallCheck = function (instance, Constructor) {
                  if (!(instance instanceof Constructor)) {
                    throw new TypeError("Cannot call a class as a function");
                  }
                };

                var props = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;

                function isFlexItem(node) {
                	var display = getComputedStyle(node.parentNode).display;
                	return display === 'flex' || display === 'inline-flex';
                }

                function createsStackingContext(node) {
                	var style = getComputedStyle(node);

                	// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
                	if (style.position === 'fixed') return true;
                	if (style.zIndex !== 'auto' && style.position !== 'static' || isFlexItem(node)) return true;
                	if (+style.opacity < 1) return true;
                	if ('transform' in style && style.transform !== 'none') return true;
                	if ('webkitTransform' in style && style.webkitTransform !== 'none') return true;
                	if ('mixBlendMode' in style && style.mixBlendMode !== 'normal') return true;
                	if ('filter' in style && style.filter !== 'none') return true;
                	if ('webkitFilter' in style && style.webkitFilter !== 'none') return true;
                	if ('isolation' in style && style.isolation === 'isolate') return true;
                	if (props.test(style.willChange)) return true;
                	if (style.webkitOverflowScrolling === 'touch') return true;

                	return false;
                }

                function findStackingContext(nodes) {
                	var i = nodes.length;

                	while (i--) {
                		if (createsStackingContext(nodes[i])) return nodes[i];
                	}

                	return null;
                }

                function getAncestors(node) {
                	var ancestors = [];

                	while (node) {
                		ancestors.push(node);
                		node = node.parentNode;
                	}

                	return ancestors; // [ node, ... <body>, <html>, document ]
                }

                function getZIndex(node) {
                	return node && Number(getComputedStyle(node).zIndex) || 0;
                }

                function last(array) {
                	return array[array.length - 1];
                }

                function compare(a, b) {
                	if (a === b) throw new Error('Cannot compare node with itself');

                	var ancestors = {
                		a: getAncestors(a),
                		b: getAncestors(b)
                	};

                	var commonAncestor = undefined;

                	// remove shared ancestors
                	while (last(ancestors.a) === last(ancestors.b)) {
                		a = ancestors.a.pop();
                		b = ancestors.b.pop();

                		commonAncestor = a;
                	}

                	var stackingContexts = {
                		a: findStackingContext(ancestors.a),
                		b: findStackingContext(ancestors.b)
                	};

                	var zIndexes = {
                		a: getZIndex(stackingContexts.a),
                		b: getZIndex(stackingContexts.b)
                	};

                	if (zIndexes.a === zIndexes.b) {
                		var children = commonAncestor.childNodes;

                		var furthestAncestors = {
                			a: last(ancestors.a),
                			b: last(ancestors.b)
                		};

                		var i = children.length;
                		while (i--) {
                			var child = children[i];
                			if (child === furthestAncestors.a) return 1;
                			if (child === furthestAncestors.b) return -1;
                		}
                	}

                	return Math.sign(zIndexes.a - zIndexes.b);
                }

                var svgns = 'http://www.w3.org/2000/svg';

                function hideNode(node) {
                	node.__ramjetOriginalTransition__ = node.style.webkitTransition || node.style.transition;
                	node.__ramjetOriginalOpacity__ = node.style.opacity;

                	node.style.webkitTransition = node.style.transition = '';

                	node.style.opacity = 0;
                }

                function showNode(node) {
                	if ('__ramjetOriginalOpacity__' in node) {
                		node.style.transition = '';
                		node.style.opacity = node.__ramjetOriginalOpacity__;

                		if (node.__ramjetOriginalTransition__) {
                			setTimeout(function () {
                				node.style.transition = node.__ramjetOriginalTransition__;
                			});
                		}
                	}
                }

                function cloneNode(node) {
                	var clone = node.cloneNode();

                	var isSvg = node.parentNode && node.parentNode.namespaceURI === svgns;

                	if (node.nodeType === 1) {
                		var width = node.style.width;
                		var height = node.style.height;

                		clone.setAttribute('style', window.getComputedStyle(node).cssText);

                		if (isSvg) {
                			clone.style.width = width;
                			clone.style.height = height;
                		}

                		var len = node.childNodes.length;
                		var i = undefined;

                		for (i = 0; i < len; i += 1) {
                			clone.appendChild(cloneNode(node.childNodes[i]));
                		}
                	}

                	return clone;
                }

                var bgColorRegexp = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d?.\d+))?\)$/;

                function parseColor(str) {
                	var match = bgColorRegexp.exec(str);

                	if (!match) return null;

                	return {
                		r: +match[1],
                		g: +match[2],
                		b: +match[3],
                		alpha: match[4] ? +match[4] : 1
                	};
                }

                var borderRadiusRegex = /^(\d+)px(?: (\d+)px)?$/;

                function parseBorderRadius(str) {
                	var match = borderRadiusRegex.exec(str);

                	return match[2] ? { x: +match[1], y: +match[2] } : { x: +match[1], y: +match[1] };
                }

                function findParentByTagName(node, tagName) {
                	while (node) {
                		if (node.tagName === tagName) {
                			return node;
                		}

                		node = node.parentNode;
                	}
                }

                function findTransformParent(node) {
                	var isSvg = node.namespaceURI === svgns && node.tagName !== 'svg';
                	return isSvg ? findParentByTagName(node, 'svg') : node.parentNode;
                }

                var div = document.createElement('div');

                var keyframesSupported = true;
                var TRANSFORM = undefined;
                var TRANSFORM_ORIGIN = undefined;
                var TRANSFORM_CSS = undefined;
                var KEYFRAMES = undefined;
                var ANIMATION = undefined;
                var ANIMATION_DIRECTION = undefined;
                var ANIMATION_DURATION = undefined;
                var ANIMATION_ITERATION_COUNT = undefined;
                var ANIMATION_NAME = undefined;
                var ANIMATION_TIMING_FUNCTION = undefined;
                var ANIMATION_END = undefined;

                // We have to browser-sniff for IE11, because it was apparently written
                // by a barrel of stoned monkeys - http://jsfiddle.net/rich_harris/oquLu2qL/

                // http://stackoverflow.com/questions/17907445/how-to-detect-ie11
                var isIe11 = !window.ActiveXObject && 'ActiveXObject' in window;

                if (!isIe11 && ('transform' in div.style || 'webkitTransform' in div.style) && ('animation' in div.style || 'webkitAnimation' in div.style)) {
                	keyframesSupported = true;

                	if ('webkitTransform' in div.style) {
                		TRANSFORM = 'webkitTransform';
                		TRANSFORM_CSS = '-webkit-transform';
                		TRANSFORM_ORIGIN = 'webkitTransformOrigin';
                	} else {
                		TRANSFORM = TRANSFORM_CSS = 'transform';
                		TRANSFORM_ORIGIN = 'transformOrigin';
                	}

                	if ('animation' in div.style) {
                		KEYFRAMES = '@keyframes';

                		ANIMATION = 'animation';
                		ANIMATION_DIRECTION = 'animationDirection';
                		ANIMATION_DURATION = 'animationDuration';
                		ANIMATION_ITERATION_COUNT = 'animationIterationCount';
                		ANIMATION_NAME = 'animationName';
                		ANIMATION_TIMING_FUNCTION = 'animationTimingFunction';

                		ANIMATION_END = 'animationend';
                	} else {
                		KEYFRAMES = '@-webkit-keyframes';

                		ANIMATION = 'webkitAnimation';
                		ANIMATION_DIRECTION = 'webkitAnimationDirection';
                		ANIMATION_DURATION = 'webkitAnimationDuration';
                		ANIMATION_ITERATION_COUNT = 'webkitAnimationIterationCount';
                		ANIMATION_NAME = 'webkitAnimationName';
                		ANIMATION_TIMING_FUNCTION = 'webkitAnimationTimingFunction';

                		ANIMATION_END = 'webkitAnimationEnd';
                	}
                } else {
                	keyframesSupported = false;
                }

                var IDENTITY = [1, 0, 0, 1, 0, 0];

                function multiply(_ref, _ref2) {
                	var a1 = _ref[0];
                	var b1 = _ref[1];
                	var c1 = _ref[2];
                	var d1 = _ref[3];
                	var e1 = _ref[4];
                	var f1 = _ref[5];
                	var a2 = _ref2[0];
                	var b2 = _ref2[1];
                	var c2 = _ref2[2];
                	var d2 = _ref2[3];
                	var e2 = _ref2[4];
                	var f2 = _ref2[5];

                	return [a1 * a2 + c1 * b2, // a
                	b1 * a2 + d1 * b2, // b
                	a1 * c2 + c1 * d2, // c
                	b1 * c2 + d1 * d2, // d
                	a1 * e2 + c1 * f2 + e1, // e
                	b1 * e2 + d1 * f2 + f1 // f
                	];
                }

                function invert(_ref3) {
                	var a = _ref3[0];
                	var b = _ref3[1];
                	var c = _ref3[2];
                	var d = _ref3[3];
                	var e = _ref3[4];
                	var f = _ref3[5];

                	var determinant = a * d - c * b;

                	return [d / determinant, b / -determinant, c / -determinant, a / determinant, (c * f - e * d) / determinant, (e * b - a * f) / determinant];
                }

                function pythag(a, b) {
                	return Math.sqrt(a * a + b * b);
                }

                function decompose(_ref4) {
                	var a = _ref4[0];
                	var b = _ref4[1];
                	var c = _ref4[2];
                	var d = _ref4[3];
                	var e = _ref4[4];
                	var f = _ref4[5];

                	// If determinant equals zero (e.g. x scale or y scale equals zero),
                	// the matrix cannot be decomposed
                	if (a * d - b * c === 0) return null;

                	// See https://github.com/Rich-Harris/Neo/blob/master/Neo.js for
                	// an explanation of the following
                	var scaleX = pythag(a, b);
                	a /= scaleX;
                	b /= scaleX;

                	var scaledShear = a * c + b * d;
                	var desheared = [a * -scaledShear + c, b * -scaledShear + d];

                	var scaleY = pythag(desheared[0], desheared[1]);

                	var skewX = scaledShear / scaleY;

                	var rotate = b > 0 ? Math.acos(a) : 2 * Math.PI - Math.acos(a);

                	return {
                		rotate: rotate,
                		scaleX: scaleX,
                		scaleY: scaleY,
                		skewX: skewX,
                		translateX: e,
                		translateY: f
                	};
                }

                function parseMatrixTransformString(transform) {
                	if (transform.slice(0, 7) !== 'matrix(') {
                		throw new Error('Could not parse transform string (' + transform + ')');
                	}

                	return transform.slice(7, -1).split(' ').map(parseFloat);
                }

                function getCumulativeTransformMatrix(node) {
                	if (node.namespaceURI === svgns) {
                		var _node$getCTM = node.getCTM();

                		var a = _node$getCTM.a;
                		var b = _node$getCTM.b;
                		var c = _node$getCTM.c;
                		var d = _node$getCTM.d;
                		var e = _node$getCTM.e;
                		var f = _node$getCTM.f;

                		return [a, b, c, d, e, f];
                	}

                	var matrix = [1, 0, 0, 1, 0, 0];

                	while (node instanceof Element) {
                		var parentMatrix = getTransformMatrix(node);

                		if (parentMatrix) {
                			matrix = multiply(parentMatrix, matrix);
                		}

                		node = findTransformParent(node);
                	}

                	return matrix;
                }

                function getTransformMatrix(node) {
                	if (node.namespaceURI === svgns) {
                		var ctm = getCumulativeTransformMatrix(node);
                		var parentCTM = getCumulativeTransformMatrix(node.parentNode);
                		return multiply(invert(parentCTM), ctm);
                	}

                	var style = getComputedStyle(node);
                	var transform = style[TRANSFORM];

                	if (transform === 'none') {
                		return null;
                	}

                	var origin = style[TRANSFORM_ORIGIN].split(' ').map(parseFloat);

                	var matrix = parseMatrixTransformString(transform);

                	// compensate for the transform origin (we want to express everything in [0,0] terms)
                	matrix = multiply([1, 0, 0, 1, origin[0], origin[1]], matrix);
                	matrix = multiply(matrix, [1, 0, 0, 1, -origin[0], -origin[1]]);

                	// TODO if is SVG, multiply by CTM, to account for viewBox

                	return matrix;
                }

                function getBoundingClientRect(node, invertedParentCTM) {
                	var originalTransformOrigin = node.style[TRANSFORM_ORIGIN];
                	var originalTransform = node.style[TRANSFORM];
                	var originalTransformAttribute = node.getAttribute('transform'); // SVG

                	node.style[TRANSFORM_ORIGIN] = '0 0';
                	node.style[TRANSFORM] = 'matrix(' + invertedParentCTM.join(',') + ')';

                	var bcr = node.getBoundingClientRect();

                	// reset
                	node.style[TRANSFORM_ORIGIN] = originalTransformOrigin;
                	node.style[TRANSFORM] = originalTransform;
                	node.setAttribute('transform', originalTransformAttribute || ''); // TODO remove attribute altogether if null?

                	return bcr;
                }

                var Wrapper = function () {
                	function Wrapper(node, options) {
                		babelHelpers.classCallCheck(this, Wrapper);

                		this.init(node, options);
                	}

                	Wrapper.prototype.init = function init(node) {
                		this._node = node;
                		this._clone = cloneNode(node);

                		var style = window.getComputedStyle(node);
                		this.style = style;

                		// we need to get the 'naked' boundingClientRect, i.e.
                		// without any transforms
                		// TODO what if the node is the root <svg> node?
                		var parentCTM = node.namespaceURI === 'svg' ? node.parentNode.getScreenCTM() : getCumulativeTransformMatrix(node.parentNode);
                		this.invertedParentCTM = invert(parentCTM);
                		this.transform = getTransformMatrix(node) || IDENTITY;
                		this.ctm = multiply(parentCTM, this.transform);

                		var bcr = getBoundingClientRect(node, this.invertedParentCTM);
                		this.bcr = bcr;

                		// TODO create a flat array? easier to work with later?
                		var borderRadius = {
                			tl: parseBorderRadius(style.borderTopLeftRadius),
                			tr: parseBorderRadius(style.borderTopRightRadius),
                			br: parseBorderRadius(style.borderBottomRightRadius),
                			bl: parseBorderRadius(style.borderBottomLeftRadius)
                		};

                		this.borderRadius = borderRadius;
                		this.opacity = +style.opacity;
                		this.rgba = parseColor(style.backgroundColor);

                		this.left = bcr.left;
                		this.top = bcr.top;
                		this.width = bcr.width;
                		this.height = bcr.height;
                	};

                	Wrapper.prototype.insert = function insert() {
                		var bcr = this.bcr;

                		var offsetParent = this._node.offsetParent;

                		var clone = undefined;

                		if (this._node.namespaceURI === svgns) {
                			// TODO what if it's the <svg> itself, not a child?
                			var svg = findParentByTagName(this._node, 'svg'); // TODO should be the namespace boundary - could be SVG inside SVG

                			clone = svg.cloneNode(false);
                			clone.appendChild(this._clone); // TODO what about transforms?
                		} else {
                				clone = this._clone;
                			}

                		var offsetParentStyle = window.getComputedStyle(offsetParent);
                		var offsetParentBcr = getBoundingClientRect(offsetParent, invert(getCumulativeTransformMatrix(offsetParent.parentNode)));

                		clone.style.position = 'absolute';
                		clone.style[TRANSFORM_ORIGIN] = '0 0';
                		clone.style.top = bcr.top - parseInt(this.style.marginTop, 10) - (offsetParentBcr.top - parseInt(offsetParentStyle.marginTop, 10)) + 'px';
                		clone.style.left = bcr.left - parseInt(this.style.marginLeft, 10) - (offsetParentBcr.left - parseInt(offsetParentStyle.marginLeft, 10)) + 'px';

                		// TODO we need to account for transforms *between* the offset parent and the node

                		offsetParent.appendChild(clone);
                	};

                	Wrapper.prototype.detach = function detach() {
                		this._clone.parentNode.removeChild(this._clone);
                	};

                	Wrapper.prototype.setOpacity = function setOpacity(opacity) {
                		this._clone.style.opacity = opacity;
                	};

                	Wrapper.prototype.setTransform = function setTransform(transform) {
                		this._clone.style.transform = this._clone.style.webkitTransform = this._clone.style.msTransform = transform;
                	};

                	Wrapper.prototype.setBackgroundColor = function setBackgroundColor(color) {
                		this._clone.style.backgroundColor = color;
                	};

                	Wrapper.prototype.setBorderRadius = function setBorderRadius(borderRadius) {
                		this._clone.style.borderRadius = borderRadius;
                	};

                	Wrapper.prototype.animateWithKeyframes = function animateWithKeyframes(id, duration) {
                		this._clone.style[ANIMATION_DIRECTION] = 'alternate';
                		this._clone.style[ANIMATION_DURATION] = duration / 1000 + 's';
                		this._clone.style[ANIMATION_ITERATION_COUNT] = 1;
                		this._clone.style[ANIMATION_NAME] = id;
                		this._clone.style[ANIMATION_TIMING_FUNCTION] = 'linear';
                	};

                	Wrapper.prototype.freeze = function freeze() {
                		var computedStyle = getComputedStyle(this._clone);

                		this.setOpacity(computedStyle.opacity);
                		this.setTransform(computedStyle.transform);
                		this.setBackgroundColor(computedStyle.backgroundColor);
                		this.setBorderRadius(computedStyle.borderRadius);

                		this._clone.style[ANIMATION] = 'none';
                	};

                	return Wrapper;
                }();

                function getOpacityInterpolator(from, to, order) {
                	var opacity = {};

                	return function (t) {
                		var targetOpacity = (to - from) * t + from;

                		// Based on the blending formula here. (http://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending)
                		// This is a quadratic blending function that makes the top layer and bottom layer blend linearly.
                		// However there is an asymptote at target=1 so that needs to be handled with an if else statement.
                		if (targetOpacity === 1) {
                			if (order === 1) {
                				opacity.from = 1 - t;
                				opacity.to = 1;
                			} else {
                				opacity.from = 1;
                				opacity.to = t;
                			}
                		} else {
                			opacity.from = targetOpacity - t * t * targetOpacity;
                			opacity.to = (targetOpacity - opacity.from) / (1 - opacity.from);
                		}

                		return opacity;
                	};
                }

                function getRgbaInterpolator(a, b, order) {
                	if (a.alpha === 1 && b.alpha === 1) {
                		// no need to animate anything
                		return null;
                	}

                	var rgba = {};
                	var opacityAt = getOpacityInterpolator(a.alpha, b.alpha, order);

                	return function (t) {
                		var opacity = opacityAt(t);

                		rgba.from = 'rgba(' + a.r + ',' + a.g + ',' + a.b + ',' + opacity.from + ')';
                		rgba.to = 'rgba(' + b.r + ',' + b.g + ',' + b.b + ',' + opacity.to + ')';

                		return rgba;
                	};
                }

                function interpolateArray(a, b) {
                	var len = a.length;
                	var array = new Array(len);

                	return function (t) {
                		var i = len;
                		while (i--) {
                			array[i] = a[i] + t * (b[i] - a[i]);
                		}

                		return array;
                	};
                }

                // Border radius is given as a string in the following form
                //
                //     tl.x tr.x br.x bl.x / tl.y tr.y br.y bl.y
                //
                // ...where t, r, b and l are top, right, bottom, left, and
                // x and y are self-explanatory. Each value is followed by 'px'

                // TODO it must be possible to do this more simply. Maybe have
                // a flat array from the start?

                function getBorderRadiusInterpolator(a, b) {
                	// TODO fast path - no transition needed

                	var aWidth = a.width;
                	var aHeight = a.height;

                	var bWidth = b.width;
                	var bHeight = b.height;

                	a = a.borderRadius;
                	b = b.borderRadius;

                	var a_x_t0 = [a.tl.x, a.tr.x, a.br.x, a.bl.x];
                	var a_y_t0 = [a.tl.y, a.tr.y, a.br.y, a.bl.y];

                	var b_x_t1 = [b.tl.x, b.tr.x, b.br.x, b.bl.x];
                	var b_y_t1 = [b.tl.y, b.tr.y, b.br.y, b.bl.y];

                	var a_x_t1 = b_x_t1.map(function (x) {
                		return x * aWidth / bWidth;
                	});
                	var a_y_t1 = b_y_t1.map(function (y) {
                		return y * aHeight / bHeight;
                	});

                	var b_x_t0 = a_x_t0.map(function (x) {
                		return x * bWidth / aWidth;
                	});
                	var b_y_t0 = a_y_t0.map(function (y) {
                		return y * bHeight / aHeight;
                	});

                	var ax = interpolateArray(a_x_t0, a_x_t1);
                	var ay = interpolateArray(a_y_t0, a_y_t1);

                	var bx = interpolateArray(b_x_t0, b_x_t1);
                	var by = interpolateArray(b_y_t0, b_y_t1);

                	var borderRadius = {};

                	return function (t) {
                		var x = ax(t);
                		var y = ay(t);

                		borderRadius.from = x.join('px ') + 'px / ' + y.join('px ') + 'px';

                		x = bx(t);
                		y = by(t);

                		borderRadius.to = x.join('px ') + 'px / ' + y.join('px ') + 'px';

                		return borderRadius;
                	};
                }

                function interpolateMatrices(a, b) {
                	var transform = [];

                	return function (t) {
                		var i = a.length;
                		while (i--) {
                			var from = a[i];
                			var to = b[i];
                			transform[i] = from + t * (to - from);
                		}

                		return 'matrix(' + transform.join(',') + ')';
                	};
                }

                function interpolate(a, b) {
                	var d = b - a;
                	return function (t) {
                		return a + t * d;
                	};
                }

                function getRotation(radians) {
                	while (radians > Math.PI) {
                		radians -= Math.PI * 2;
                	}while (radians < -Math.PI) {
                		radians += Math.PI * 2;
                	}return radians;
                }

                function interpolateDecomposedTransforms(a, b) {
                	var rotate = interpolate(getRotation(a.rotate), getRotation(b.rotate));
                	var skewX = interpolate(a.skewX, b.skewX);
                	var scaleX = interpolate(a.scaleX, b.scaleX);
                	var scaleY = interpolate(a.scaleY, b.scaleY);
                	var translateX = interpolate(a.translateX, b.translateX);
                	var translateY = interpolate(a.translateY, b.translateY);

                	return function (t) {
                		var transform = 'translate(' + translateX(t) + 'px, ' + translateY(t) + 'px) rotate(' + rotate(t) + 'rad) skewX(' + skewX(t) + 'rad) scale(' + scaleX(t) + ', ' + scaleY(t) + ')';
                		return transform;
                	};
                }

                function getTransformInterpolator(a, b) {
                	var scale_x = b.width / a.width;
                	var scale_y = b.height / a.height;
                	var d_x = b.left - a.left;
                	var d_y = b.top - a.top;

                	var a_start = a.transform;

                	var move_a_to_b = [1, 0, 0, 1, d_x, d_y];
                	var scale_a_to_b = [scale_x, 0, 0, scale_y, 0, 0];

                	var matrix = IDENTITY;

                	matrix = multiply(matrix, a.invertedParentCTM);
                	matrix = multiply(matrix, move_a_to_b);
                	matrix = multiply(matrix, b.ctm);
                	matrix = multiply(matrix, scale_a_to_b);

                	var decomposed_start = decompose(a_start);
                	var decomposed_end = decompose(matrix);

                	if (!decomposed_start || !decomposed_end) return interpolateMatrices(a_start, matrix);
                	return interpolateDecomposedTransforms(decomposed_start, decomposed_end);
                }

                function linear(pos) {
                	return pos;
                }

                function easeIn(pos) {
                	return Math.pow(pos, 3);
                }

                function easeOut(pos) {
                	return Math.pow(pos - 1, 3) + 1;
                }

                function easeInOut(pos) {
                	if ((pos /= 0.5) < 1) {
                		return 0.5 * Math.pow(pos, 3);
                	}

                	return 0.5 * (Math.pow(pos - 2, 3) + 2);
                }

                var head = document.getElementsByTagName('head')[0];

                function addCss(css) {
                	var styleElement = document.createElement('style');
                	styleElement.type = 'text/css';

                	// Internet Exploder won't let you use styleSheet.innerHTML - we have to
                	// use styleSheet.cssText instead
                	var styleSheet = styleElement.styleSheet;

                	if (styleSheet) {
                		styleSheet.cssText = css;
                	} else {
                		styleElement.innerHTML = css;
                	}

                	head.appendChild(styleElement);

                	return function () {
                		return head.removeChild(styleElement);
                	};
                }

                function getKeyframes(from, to, interpolators, easing, remaining, duration) {
                	var numFrames = remaining / 16;

                	var fromKeyframes = '';
                	var toKeyframes = '';

                	function addKeyframes(pc, t) {
                		var opacity = interpolators.opacity(t);
                		var backgroundColor = interpolators.backgroundColor ? interpolators.backgroundColor(t) : null;
                		var borderRadius = interpolators.borderRadius ? interpolators.borderRadius(t) : null;
                		var transformFrom = interpolators.transformFrom(t);
                		var transformTo = interpolators.transformTo(1 - t);

                		fromKeyframes += '\n' + (pc + '% {') + ('opacity: ' + opacity.from + ';') + (TRANSFORM_CSS + ': ' + transformFrom + ';') + (backgroundColor ? 'background-color: ' + backgroundColor.from + ';' : '') + (borderRadius ? 'border-radius: ' + borderRadius.from + ';' : '') + '}';

                		toKeyframes += '\n' + (pc + '% {') + ('opacity: ' + opacity.to + ';') + (TRANSFORM_CSS + ': ' + transformTo + ';') + (backgroundColor ? 'background-color: ' + backgroundColor.to + ';' : '') + (borderRadius ? 'border-radius: ' + borderRadius.to + ';' : '') + '}';
                	}

                	var i = undefined;
                	var startPos = 1 - remaining / duration;

                	for (i = 0; i < numFrames; i += 1) {
                		var relPos = i / numFrames;
                		var absPos = startPos + remaining / duration * relPos;

                		var pc = 100 * relPos;
                		var t = easing(absPos);

                		addKeyframes(pc, t);
                	}

                	addKeyframes(100, 1);

                	return { fromKeyframes: fromKeyframes, toKeyframes: toKeyframes };
                }

                function generateId() {
                	return 'ramjet' + ~ ~(Math.random() * 1000000);
                }

                var rAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (fn) {
                            return setTimeout(fn, 16);
                };

                function transformer(from, to, options) {
                	var duration = options.duration || 400;
                	var easing = options.easing || linear;

                	var useTimer = !keyframesSupported || !!options.useTimer;

                	var order = compare(from._node, to._node);

                	var interpolators = {
                		opacity: getOpacityInterpolator(from.opacity, to.opacity, order),
                		backgroundColor: options.interpolateBackgroundColor ? getRgbaInterpolator(from.rgba, to.rgba, order) : null,
                		borderRadius: options.interpolateBorderRadius ? getBorderRadiusInterpolator(from, to) : null,
                		transformFrom: getTransformInterpolator(from, to),
                		transformTo: getTransformInterpolator(to, from)
                	};

                	var running = undefined;
                	var disposeCss = undefined;
                	var torndown = undefined;

                	var remaining = duration;
                	var endTime = undefined;

                	function tick() {
                		if (!running) return;

                		var timeNow = Date.now();
                		remaining = endTime - timeNow;

                		if (remaining < 0) {
                			transformer.teardown();
                			if (options.done) options.done();

                			return;
                		}

                		var t = easing(1 - remaining / duration);
                		transformer.goto(t);

                		rAF(tick);
                	}

                	var transformer = {
                		teardown: function () {
                			if (torndown) return transformer;

                			running = false;
                			torndown = true;

                			from.detach();
                			to.detach();

                			from = null;
                			to = null;

                			return transformer;
                		},
                		goto: function (pos) {
                			transformer.pause();

                			var t = easing(pos);

                			// opacity
                			var opacity = interpolators.opacity(t);
                			from.setOpacity(opacity.from);
                			to.setOpacity(opacity.to);

                			// transform
                			var transformFrom = interpolators.transformFrom(t);
                			var transformTo = interpolators.transformTo(1 - t);
                			from.setTransform(transformFrom);
                			to.setTransform(transformTo);

                			// background color
                			if (interpolators.backgroundColor) {
                				var backgroundColor = interpolators.backgroundColor(t);
                				from.setBackgroundColor(backgroundColor.from);
                				to.setBackgroundColor(backgroundColor.to);
                			}

                			// border radius
                			if (interpolators.borderRadius) {
                				var borderRadius = interpolators.borderRadius(t);
                				from.setBorderRadius(borderRadius.from);
                				to.setBorderRadius(borderRadius.to);
                			}

                			return transformer;
                		},
                		pause: function () {
                			if (!running) return transformer;
                			running = false;

                			if (!useTimer) {
                				// TODO derive current position somehow, use that rather than
                				// current computed style (from and to get out of sync in
                				// some browsers?)
                				remaining = endTime - Date.now();

                				from.freeze();
                				to.freeze();
                				disposeCss();
                			}

                			return transformer;
                		},
                		play: function () {
                			if (running) return transformer;
                			running = true;

                			endTime = Date.now() + remaining;

                			if (useTimer) {
                				rAF(tick);
                			} else {
                				var _getKeyframes = getKeyframes(from, to, interpolators, options.easing || linear, remaining, duration);

                				var fromKeyframes = _getKeyframes.fromKeyframes;
                				var toKeyframes = _getKeyframes.toKeyframes;

                				var fromId = generateId();
                				var toId = generateId();

                				var css = '\n\t\t\t\t\t' + KEYFRAMES + ' ' + fromId + ' { ' + fromKeyframes + ' }\n\t\t\t\t\t' + KEYFRAMES + ' ' + toId + '   { ' + toKeyframes + ' }';

                				disposeCss = addCss(css);

                				from.animateWithKeyframes(fromId, remaining);
                				to.animateWithKeyframes(toId, remaining);
                			}

                			return transformer;
                		}
                	};

                	// handle animation end
                	if (!useTimer) {
                		(function () {
                			var animating = 2;

                			var done = function () {
                				if (! --animating) {
                					transformer.teardown();

                					if (options.done) options.done();

                					disposeCss();
                				}
                			};

                			from._clone.addEventListener(ANIMATION_END, done);
                			to._clone.addEventListener(ANIMATION_END, done);
                		})();
                	}

                	return transformer.play();
                }

                function transform(fromNode, toNode) {
                	var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

                	if (typeof options === 'function') {
                		options = { done: options };
                	}

                	if (!('duration' in options)) {
                		options.duration = 400;
                	}

                	var from = new Wrapper(fromNode, options);
                	var to = new Wrapper(toNode, options);

                	var order = compare(from._node, to._node);

                	from.setOpacity(1);
                	to.setOpacity(0);

                	// in many cases, the stacking order of `from` and `to` is
                	// determined by their relative location in the document –
                	// so we need to preserve it
                	if (order === 1) {
                		to.insert();
                		from.insert();
                	} else {
                		from.insert();
                		to.insert();
                	}

                	return transformer(from, to, options);
                }

                function hide() {
                	for (var _len = arguments.length, nodes = Array(_len), _key = 0; _key < _len; _key++) {
                		nodes[_key] = arguments[_key];
                	}

                	nodes.forEach(hideNode);
                }

                function show() {
                	for (var _len2 = arguments.length, nodes = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                		nodes[_key2] = arguments[_key2];
                	}

                	nodes.forEach(showNode);
                }

                exports.transform = transform;
                exports.hide = hide;
                exports.show = show;
                exports.linear = linear;
                exports.easeIn = easeIn;
                exports.easeOut = easeOut;
                exports.easeInOut = easeInOut;

    }));

    });

    const components = {};
    const getPosition = (node, addOffset = false) => {
      const rect = node.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(node);
      const marginTop = parseInt(computedStyle.marginTop, 10);
      const marginLeft = parseInt(computedStyle.marginLeft, 10);

      return {
        top: `${rect.top -
      marginTop +
      (addOffset ? 1 : 0) *
        (window.pageYOffset || document.documentElement.scrollTop)}px`,
        left: `${rect.left - marginLeft}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: computedStyle.borderRadius,
        position: "absolute"
      };
    };
    var script = {
      props: {
        tag: {
          type: String,
          default: () => "div"
        },
        id: {
          type: String,
          required: true
        },
        duration: {
          type: Number,
          default: () => 400
        },
        easing: {
          type: Function,
          default: () => ramjet_umd.linear
        }
      },
      data() {
        return {
          animating: false,
          transformer: {}
        };
      },
      mounted() {
        const match = components[this.id];
        if (match) {
          this.handleMatch();
        } else {
          this.cache();
        }
      },
      beforeUnmount() {
        if (this.animating) {
          this.transformer.teardown();
        }
      },
      methods: {
        cache() {
          components[this.id] = {
            el: this.$slots.default,
            pos: getPosition(this.$el.firstChild)
          };
        },
        cloneAndAppend() {
          const { el, pos } = components[this.id];
          const clone = el[0].elm.cloneNode(true);
          clone.setAttribute("data-clone", this.id);
          Object.assign(clone.style, pos);
          document.body.appendChild(clone);
        },
        bustCache() {
          Object.keys(components).forEach(id => {
            components[id] = false;
          });
        },
        animate(cb = () => {}) {
          const a = document.querySelector(`[data-clone='${this.id}']`);
          const b = this.$el.firstChild;
          this.animating = true;
          this.transformer = ramjet_umd.transform(a, b, {
            duration: this.duration,
            easing: this.easing,
            appendToBody: true,
            done: () => {
              cb(a, b);
              this.animating = false;
              this.$emit("animation-end");
            }
          });
          ramjet_umd.hide(a, b);
        },
        handleMatch() {
          this.cloneAndAppend();
          const cb = (a, b) => {
            ramjet_umd.show(b);
          };
          this.$nextTick(() => {
            this.animate(cb);
            const clone = document.querySelector(`[data-clone='${this.id}']`);
            document.body.removeChild(clone);
            this.cache();
          });
        }
      },
      render() {
        return h(this.tag, [this.$slots.default]);
      }
    };

    const render = () => {};


    script.render = render;
    script.__file = "src/Overdrive.vue";

    function install(Vue) {
      if (install.installed) return;
      install.installed = true;
      Vue.component('overdrive', script);
    }

    const VOverdrive = script;

    const plugin = {
      install,

      get enabled() {
        return state.enabled;
      },

      set enabled(value) {
        state.enabled = value;
      }
    };

    // Auto-install
    let GlobalVue = null;
    if (typeof window !== 'undefined') {
      GlobalVue = window.Vue;
    } else if (typeof global !== 'undefined') {
      GlobalVue = global.Vue;
    }
    if (GlobalVue) {
      GlobalVue.use(plugin);
    }

    exports.VOverdrive = VOverdrive;
    exports.default = plugin;
    exports.install = install;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
