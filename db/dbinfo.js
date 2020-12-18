module.exports = (function () {
  return {
    local: { // localhost
      host: '127.0.0.1',
      port: '3306',
      user: 'moldusr',
      password: 'dawinit1',
      database: 'mold'
    },
    real: { // real server db info
      host: process.env.DBIP  || 'localhost',
      port: '3306',
      user: 'moldusr',
      password: 'dawinit1',
      database: 'mold'
    },
    dev: { // dev server db info
      host: '',
      port: '',
      user: '',
      password: '',
      database: ''
    }
  }
})();
