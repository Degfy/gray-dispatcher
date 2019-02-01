# 灰度分发器

## UUID_RAND 根据 UUID 随机分发

```js
{
    type: 'UUID_RAND',
    n: 10,
    s: [4, 9],

    machine: { //标识 一个服务
        target: 'http://localhost:7003',
        ws: true, //是否同时支持 websocket
    },
}
```

## KEY_MATCH

```js
{
    type: 'KEY_MATCH',
    key: 'cookies._clinic_id',
    pattern: String|Array,
    machine,
}
```

## FUNCTION

```js
{
    type: 'FUNCTION',
    // fn: `function (req){return req.url;}`, //支持函数字符串
    fn(req) {
        if (req.url.match('/api/stats/clinic/registration/search')) {
            // 要求返回一个服务器标识
            return {
                target: 'http://localhost:7004',
            };
        }
    },
    // machine: {
    //     target: '',
    // },
}


```

## REGION

```js
{
    type: 'REGION',
    region: String|Array, // ['北京','上海'] | '成都'
    machine: {
        target: 'http://localhost:7001',
        ws: true,
    },
}
```

# example

```js
const http = require('http');
const Dispatcher = require('./dispatcher');

function getStrategy() {
    return [
        {
            type: 'REGION',
            region: '内网',
            machine: {
                target: 'http://localhost:7001',
                ws: true,
            },
        },
        {
            type: Dispatcher.DISPATCHERTYPE.FUNCTION,
            // fn: `function (req){return req.url;}`, //支持函数字符串
            fn(req) {
                if (req.url.match('/api/stats/clinic/registration/search')) {
                    return {
                        target: 'http://localhost:7004',
                    };
                }
            },
            // machine: {
            //     target: '',
            // },
        },
        {
            type: 'KEY_MATCH',
            key: 'cookies._clinic_id',
            pattern: '03d490b944f748aba869cca4adb41f07',
            machine: {
                target: 'http://localhost:7001',
                ws: true,
            },
        },
        {
            type: 'UUID_RAND',
            n: 10,
            s: [4, 9],
            machine: {
                target: 'http://localhost:7003',
                ws: true,
            },
        },
    ];
}

const {web, upgrade} = Dispatcher(
    {
        target: 'http://localhost:7002',
        ws: true,
    },
    getStrategy
);

const server = http.createServer(web);
server.on('upgrade', upgrade);
server.listen(9000);
```
