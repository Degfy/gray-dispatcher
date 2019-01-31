const http = require('http');
const Dispatcher = require('./dispatcher');

function getStrategy() {
    return [{
        type: Dispatcher.DISPATCHERTYPE.FUNCTION,
        // fn: `function (req){return req.url;}`, //支持函数字符串
        fn(req) {
            if (req.url.match('/api/stats/clinic/registration/search')) {
                return {
                    target: 'http://localhost:7004',
                };
            }
        }
    }, {
        type: 'KEY_MATCH',
        key: 'cookies._clinic_id',
        pattern: '03d490b944f748aba869cca4adb41f07',
        machine: {
            target: 'http://localhost:7001',
            ws: true,
        },
    }, {
        type: 'UUID_RAND',
        n: 10,
        s: [4, 9],
        machine: {
            target: 'http://localhost:7003',
            ws: true,
        },
    }];
}

const { web, upgrade } = Dispatcher({
    target: 'http://localhost:7002',
    ws: true,
}, getStrategy);

const server = http.createServer(web);
server.on('upgrade', upgrade);
server.listen(9000);