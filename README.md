# Tough Cookie FTP Store

[![npm version](https://img.shields.io/npm/v/tough-cookie-ftp-store.svg)](https://npmjs.com/package/tough-cookie-ftp-store)
[![npm downloads](https://img.shields.io/npm/dt/tough-cookie-ftp-store.svg)](https://npmjs.com/package/tough-cookie-ftp-store)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Build Status](https://travis-ci.com/ridvanaltun/tough-cookie-ftp-store.svg?branch=master)](https://travis-ci.com/ridvanaltun/tough-cookie-ftp-store)
[![license](https://img.shields.io/npm/l/tough-cookie-ftp-store.svg)](https://github.com/ridvanaltun/tough-cookie-ftp-store/blob/master/LICENSE)

## Installation

```bash
npm install tough-cookie-ftp-store --save
```

## Usage

```javascript
const { CookieJar, Cookie } = require('tough-cookie');
const { FtpCookieStore } = require('tough-cookie-ftp-store');

const ftpConfig = {
  host: 'example.com',
  port: 21,
  user: 'my-username',
  password: 'my-secret-password',
  secure: false
};

const filePath = '/cookies/my-cookies.json';

const main = async () => {
  // create client
  const store = new FtpCookieStore(filePath, {
    timeout: 30000, // ftp connection timeout, in ms (30 seconds)
    debug: false
  });

  // connect to ftp server
  await store.connect(ftpConfig);

  // create a cookie jar
  const cookieJar = new CookieJar(store);

  // set an example cookie
  const cookie = Cookie.parse('foo=bar; Domain=example.com; Path=/');

  // put cookie to cookie jar
  await cookieJar.setCookie(cookie, 'http://example.com', (error, cookie) => {
    // handle errors
    if (error) {
      console.log(error);
    }

    // show cookie
    console.log(cookie);

    // kill ftp connection
    store.disconnect();
  });
}
```

## License

[GNU General Public License v3.0](https://github.com/ridvanaltun/tough-cookie-ftp-store/blob/master/LICENSE)
