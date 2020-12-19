const { Store, permuteDomain, pathMatch, Cookie } = require('tough-cookie')
const { Readable, Writable } = require('stream')
const objectAssignDeep = require(`object-assign-deep`)
const ftp = require('basic-ftp')
const util = require('util')
const path = require('path')

/**
 * Class representing a JSON file store.
 *
 * @augments Store
 */
class FtpCookieStore extends Store {
  /**
   * Creates a new JSON file store in the specified file.
   *
   * @param {string}  filePath                - FTP save path to cookies
   * @param {object}  options                 - Store options
   * @param {boolean} [options.debug=false]   - Debug
   * @param {number}  [options.timeout=30000] - FTP connection timeout in ms, default is 30000 (30 seconds)
   */
  constructor (filePath, options) {
    super()

    // set default options
    const _options = objectAssignDeep(
      {
        debug: false,
        timeout: 30000
      },
      options
    )

    // false by default anyway
    this.synchronous = false

    // idx is memory cache
    this.idx = {}

    // save file path
    this.filePath = filePath[0] === '.' ? filePath.substring(1) : filePath
    this.destinationDir = path.dirname(this.filePath)
    this.filename = path.basename(this.filePath)

    if (!filePath) {
      throw new Error('Unknown file path')
    }

    // create for ftp client
    this.client = new ftp.Client(_options.timeout)

    // verbose ftp connection
    if (_options.debug) {
      this.client.ftp.verbose = true
    }

    if (util.inspect.custom) {
      this[util.inspect.custom] = this._inspect
    }
  }

  /**
   * Connect to FTP server.
   *
   * @param {object}  options                 - FTP connection options
   * @param {string}  options.host            - FTP host
   * @param {number}  [options.port=21]       - FTP port
   * @param {string}  [options.user]          - FTP username
   * @param {string}  [options.password]      - FTP password
   * @param {boolean} [options.secure=false]  - FTP secure
   */
  async connect (options) {
    // set default options
    const _options = objectAssignDeep(
      {
        port: 21,
        secure: false
      },
      options
    )

    if (!_options.host) {
      throw new Error('Unknown hostname')
    }

    // connect to ftp
    await this.client.access(_options)

    // creating all directories as necessary
    await this.client.ensureDir(this.destinationDir)

    // retrieve cookies
    await this._loadFromFtp(this.filePath, dataJson => {
      if (dataJson) {
        this.idx = dataJson
      }
    })
  }

  /**
   * Kill the FTP connection.
   */
  disconnect () {
    this.client.close()
  }

  /**
   * The findCookie callback.
   *
   * @callback FileCookieStore~findCookieCallback
   * @param {Error} error - The error if any.
   * @param {Cookie} cookie - The cookie found.
   */

  /**
   * Retrieve a cookie with the given domain, path and key.
   *
   * @param {string}                              domain  - The cookie domain.
   * @param {string}                              path    - The cookie path.
   * @param {string}                              key     - The cookie key.
   * @param {FileCookieStore~findCookieCallback}  cb      - The callback.
   */
  findCookie (domain, path, key, cb) {
    if (!this.idx[domain]) {
      cb(null, undefined)
    } else if (!this.idx[domain][path]) {
      cb(null, undefined)
    } else {
      cb(null, this.idx[domain][path][key] || null)
    }
  }

  /**
   * The findCookies callback.
   *
   * @callback FileCookieStore~allowSpecialUseDomainCallback
   * @param {Error}     error   - The error if any.
   * @param {Cookie[]}  cookies - Array of cookies.
   */

  /**
   * The findCookies callback.
   *
   * @callback FileCookieStore~findCookiesCallback
   * @param {Error} error - The error if any.
   * @param {Cookie[]} cookies - Array of cookies.
   */

  /**
   * Locates cookies matching the given domain and path.
   *
   * @param {string}                                        domain                - The cookie domain.
   * @param {string}                                        path                  - The cookie path.
   * @param {FileCookieStore~allowSpecialUseDomainCallback} allowSpecialUseDomain - The callback.
   * @param {FileCookieStore~findCookiesCallback}           cb                    - The callback.
   */
  findCookies (domain, path, allowSpecialUseDomain, cb) {
    const results = []

    if (typeof allowSpecialUseDomain === 'function') {
      cb = allowSpecialUseDomain
      allowSpecialUseDomain = false
    }

    if (!domain) {
      cb(null, [])
    }

    let pathMatcher
    if (!path) {
      pathMatcher = function matchAll (domainIndex) {
        for (const curPath in domainIndex) {
          const pathIndex = domainIndex[curPath]
          for (const key in pathIndex) {
            results.push(pathIndex[key])
          }
        }
      }
    } else {
      pathMatcher = function matchRFC (domainIndex) {
        Object.keys(domainIndex).forEach(cookiePath => {
          if (pathMatch(path, cookiePath)) {
            const pathIndex = domainIndex[cookiePath]
            for (const key in pathIndex) {
              results.push(pathIndex[key])
            }
          }
        })
      }
    }

    const domains = permuteDomain(domain, allowSpecialUseDomain) || [domain]
    const idx = this.idx
    domains.forEach(curDomain => {
      const domainIndex = idx[curDomain]
      if (!domainIndex) {
        return
      }
      pathMatcher(domainIndex)
    })

    cb(null, results)
  }

  /**
   * The putCookie callback.
   *
   * @callback FileCookieStore~putCookieCallback
   * @param {Error} error - The error if any.
   */

  /**
   * Adds a new cookie to the store.
   *
   * @param {Cookie}                            cookie  - The cookie.
   * @param {FileCookieStore~putCookieCallback} cb      - The callback.
   */
  async putCookie (cookie, cb) {
    if (!this.idx[cookie.domain]) {
      this.idx[cookie.domain] = {}
    }
    if (!this.idx[cookie.domain][cookie.path]) {
      this.idx[cookie.domain][cookie.path] = {}
    }
    this.idx[cookie.domain][cookie.path][cookie.key] = cookie
    await this._saveToFtp(this.filePath, this.idx, function () {
      cb(null)
    })
  }

  /**
   * The updateCookie callback.
   *
   * @callback FileCookieStore~updateCookieCallback
   * @param {Error} error - The error if any.
   */

  /**
   * Update an existing cookie.
   *
   * @param {Cookie}                                oldCookie - The old cookie.
   * @param {Cookie}                                newCookie - The new cookie.
   * @param {FileCookieStore~updateCookieCallback}  cb        - The callback.
   */
  updateCookie (oldCookie, newCookie, cb) {
    this.putCookie(newCookie, cb)
  }

  /**
   * The removeCookie callback.
   *
   * @callback FileCookieStore~removeCookieCallback
   * @param {Error} error - The error if any.
   */

  /**
   * Remove a cookie from the store.
   *
   * @param {string}                                domain  - The cookie domain.
   * @param {string}                                path    - The cookie path.
   * @param {string}                                key     - The cookie key.
   * @param {FileCookieStore~removeCookieCallback}  cb      - The callback.
   */
  async removeCookie (domain, path, key, cb) {
    if (
      this.idx[domain] &&
      this.idx[domain][path] &&
      this.idx[domain][path][key]
    ) {
      delete this.idx[domain][path][key]
    }
    await this._saveToFtp(this.filePath, this.idx, () => {
      cb(null)
    })
  }

  /**
   * The removeCookies callback.
   *
   * @callback FileCookieStore~removeCookiesCallback
   * @param {Error} error - The error if any.
   */

  /**
   * Removes matching cookies from the store.
   *
   * @param {string} domain - The cookie domain.
   * @param {string} path - The cookie path.
   * @param {FileCookieStore~removeCookiesCallback} cb - The callback.
   */
  async removeCookies (domain, path, cb) {
    if (this.idx[domain]) {
      if (path) {
        delete this.idx[domain][path]
      } else {
        delete this.idx[domain]
      }
    }
    await this._saveToFtp(this.filePath, this.idx, () => {
      cb(null)
    })
  }

  /**
   * The removeAllCookies callback.
   *
   * @callback FileCookieStore~removeAllCookiesCallback
   * @param {Error} error - The error if any.
   */

  /**
   * Removes all cookies from the store.
   *
   * @param {FileCookieStore~removeAllCookiesCallback} cb - The callback.
   */
  async removeAllCookies (cb) {
    this.idx = {}
    await this._saveToFtp(this.filePath, this.idx, () => {
      cb(null)
    })
  }

  /**
   * The getAllCookies callback.
   *
   * @callback FileCookieStore~getAllCookiesCallback
   * @param {Error} error   - The error if any.
   * @param {Array} cookies - An array of cookies.
   */

  /**
   * Produces an Array of all cookies from the store.
   *
   * @param {FileCookieStore~getAllCookiesCallback} cb - The callback.
   */
  getAllCookies (cb) {
    const cookies = []
    const idx = this.idx

    const domains = Object.keys(idx)
    domains.forEach(domain => {
      const paths = Object.keys(idx[domain])
      paths.forEach(path => {
        const keys = Object.keys(idx[domain][path])
        keys.forEach(key => {
          if (key !== null) {
            cookies.push(idx[domain][path][key])
          }
        })
      })
    })

    cookies.sort((a, b) => {
      return (a.creationIndex || 0) - (b.creationIndex || 0)
    })

    cb(null, cookies)
  }

  /**
   * Returns a string representation of the store object for debugging purposes.
   *
   * @returns {string} - The string representation of the store.
   * @private
   */
  _inspect () {
    return `{ idx: ${util.inspect(this.idx, false, 2)} }`
  }

  /**
   * The loadFromFtp callback.
   *
   * @callback FtpCookieStore~loadFromFtpCallback
   * @param {object} dataJson - The content of the store.
   */

  /**
   * Load the store from file.
   *
   * @param {string}                              filePath  - The file in which the store will be created.
   * @param {FtpCookieStore~loadFromFtpCallback}  cb        - The callback.
   * @private
   */
  async _loadFromFtp (filePath, cb) {
    let data = null
    let dataJson = null

    const files = await this.client.list(this.destinationDir)
    const isFileExist = files.some(element => element.name === this.filename)

    if (isFileExist) {
      // download file to a variable
      const writable = new Writable({
        write: function (chunk, encoding, next) {
          data += chunk.toString()
          next()
        }
      })

      await this.client.downloadTo(writable, filePath)

      if (data) {
        try {
          dataJson = JSON.parse(data)
        } catch (e) {
          throw new Error(
            `Could not parse cookie file ${filePath}. Please ensure it is not corrupted.`
          )
        }
      }

      for (var domainName in dataJson) {
        for (var pathName in dataJson[domainName]) {
          for (var cookieName in dataJson[domainName][pathName]) {
            dataJson[domainName][pathName][cookieName] = Cookie.fromJSON(
              JSON.stringify(dataJson[domainName][pathName][cookieName])
            )
          }
        }
      }
    }

    cb(dataJson)
  }

  /**
   * The saveToFtp callback.
   *
   * @callback FileCookieStore~saveToFtpCallback
   */

  /**
   * Saves the store to a file.
   *
   * @param {string}                            filePath - The file in which the store will be created.
   * @param {object}                            data     - The data to be saved.
   * @param {FtpCookieStore~saveToFtpCallback}  cb       - The callback.
   * @private
   */
  async _saveToFtp (filePath, data, cb) {
    const jsonStr = JSON.stringify(data)
    const readable = Readable.from(jsonStr)

    // upload data to ftp server
    await this.client.uploadFrom(readable, filePath)

    cb()
  }
}

exports.FtpCookieStore = FtpCookieStore
