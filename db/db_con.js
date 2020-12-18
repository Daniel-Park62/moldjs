var mysql = require('mysql');
//var config = require('../db/dbinfo').real;
let dbip = process.env.DBIP  || "localhost" ;
let dpport = process.env.DBPORT || "3306" ;
module.exports = function () {
return {
  isconn : false,
  init: function () {
    return mysql.createConnection({
      host: dbip,
      port: dpport,
      user: 'moldusr',
      password: 'dawinit1',
      database: 'mold'
    })
  },
  test_open: function (con) {
    con.connect(function (err) {
      if (err) {
        console.error('mysql connection error :' + err);
      } else {
        console.info('mysql is connected successfully :' + dbip);
        this.isconn = true ;
      }
    })
  }
}
};
