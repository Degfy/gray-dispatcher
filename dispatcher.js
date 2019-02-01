const HttpProxy = require('http-proxy');
const is = require('is-type-of');
const Cookies = require('cookies');
const vm = require('vm');
const ip2region = require('abc-ip2region').create();
const IP = Symbol('context#ip');

const DISPATCHERTYPE = {
    UUID_RAND: 'UUID_RAND',
    KEY_MATCH: 'KEY_MATCH',
    FUNCTION: 'FUNCTION',
};

function matchMachine(req, strategies) {
    const _strategyFnMap = {
        UUID_RAND({ n, s, machine }) {
            const cookies = new Cookies(req);
            const uuid = cookies.get('uuid');
            if (is.string(uuid) && uuid.length > 6) {
                const m = parseInt(uuid.substr(-6), 16) % n;
                if (is.number(s)) {
                    s = [s]
                }
                if (is.array(s) && s.some(o => o === m)) {
                    return machine;
                }
            }
        },

        KEY_MATCH({ key, pattern, machine }) {
            const matches = key.match(/^((cookies|headers)\.)?([^\.\s]{1,32})$/);
            if (matches) {
                let value
                const [, , type, vk] = matches;
                switch (type) {
                    case 'cookies':
                        const cookies = new Cookies(req);
                        value = cookies.get(vk);
                        break;
                    case 'headers':
                        value = ctx.headers[vk];
                        break;
                    default:
                        value = ctx[vk];
                }

                if (is.string(pattern)) {
                    pattern = [pattern];
                }

                if (is.array(pattern)) {
                    if (
                        pattern.some(p => new RegExp(p).test(value))
                    ) {
                        return machine;
                    }
                }
            }
        },

        FUNCTION({ fn, machine }) {
            if (is.string(fn)) {
                const fnCode = `(${fn})(this.req)`;
                fn = function(req) {
                    return vm.runInContext(fnCode, vm.createContext({ req }));
                }
            }

            if (is.function(fn)) {
                const rst = fn(req);
                if (rst) {
                    return machine || rst;
                }
            }
        },

        REGION({ region, machine }) {
            if (req.ip && region) {
                if (is.string(region)) {
                    region = [region];
                }
                try {
                    const ip = req.ip.replace(/^::ffff:/, '');
                    const rst = ip2region.memorySearchSync(ip);
                    if (rst && rst.region.match(new RegExp(region.join('|')))) {
                        return machine;
                    }
                } catch (e) {
                    return;
                }
            }
        },
    };
    let machine
    strategies.some(strategy => {
        const fn = _strategyFnMap[strategy.type];
        if (is.function(fn)) {
            machine = fn(strategy);
            return machine;
        }
    });
    return machine;
}

function Dispatcher(defaultMachine, getStrategy, { isAsync = false, proxy = true } = { isAsync: true, proxy: true }) {
    const _map = new Map();

    function getMachineProxyServer(machine) {
        const key = JSON.stringify(machine);
        let proxy = _map.get(key);
        if (!proxy) {
            proxy = new HttpProxy.createProxyServer(machine);
            _map.set(key, proxy);

            proxy.$web = function(req, res, fn) {
                let _resolve
                const promise = new Promise(resolve => {
                    _resolve = resolve;
                });

                const end = (reqE, resE) => {
                    if (_resolve && reqE === req && resE == res) {
                        _resolve(res);
                        proxy.off('end', end);
                    }
                };

                proxy.on('end', end);
                proxy.web(req, res, fn);
                return promise;
            }
        }

        return proxy;
    }

    function reqHelper(req) {
        req.get = function(field) {
            const req = this;
            switch (field = field.toLowerCase()) {
                case 'referer':
                case 'referrer':
                    return req.headers.referrer || req.headers.referer || '';
                default:
                    return req.headers[field] || '';
            }
        };

        Object.defineProperty(req, 'ips', {
            configurable: true,
            enumerable: true,
            get() {
                const val = this.get('X-Forwarded-For');
                return proxy && val ?
                    val.split(/\s*,\s*/) : [];
            },
        });

        Object.defineProperty(req, 'ip', {
            configurable: true,
            enumerable: true,
            get() {
                if (!this[IP]) {
                    this[IP] = this.ips[0] || this.socket.remoteAddress || '';
                }
                return this[IP];
            },
        });

        // 将ip地址加入到代理
        const ips = [...req.ips];
        if (req.socket.remoteAddress) {
            ips.push(req.socket.remoteAddress);
        }
        req.headers['x-forwarded-for'] = ips.join(',');
    }

    function web(req, res) {
        reqHelper(req);
        const strategies = getStrategy();
        const machine = matchMachine(req, strategies) || defaultMachine;

        const proxyServer = getMachineProxyServer(machine);

        function errorHandle(err) {
            console.error(err);
            // todo
            res.end('error in server when proxy');
        }

        if (isAsync) {
            return proxyServer.$web(req, res, errorHandle);
        } else {
            return proxyServer.web(req, res, errorHandle);
        }
    }

    function upgrade(req, socket, head) {
        reqHelper(req);
        const strategies = getStrategy();
        const machine = matchMachine(req, strategies) || defaultMachine;
        const proxyServer = getMachineProxyServer(machine);
        proxyServer.ws(req, socket, head);
    }

    return { web, upgrade };
}

Dispatcher.DISPATCHERTYPE = DISPATCHERTYPE;
module.exports = Dispatcher;