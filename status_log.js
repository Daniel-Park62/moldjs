"use strict";
let DEVNUM = 2 ;
const DEVPORT = 1503;

let GWIP = process.env.GWIP || "192.168.0.233" ;

console.info( "GateWay :" + GWIP  );

const mysql_dbc = require('./db/db_con')();
let con = mysql_dbc.init();
mysql_dbc.test_open(con);
con.isconn = true ;

require('date-utils');

let moteinfo = require('./api/moteinfo');
let apinfo = require('./api/apinfo');

const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// con.query(`CREATE TABLE status_logs (
//     seq INT NOT NULL,
//     tm TIMESTAMP NOT NULL,
//     act INT NULL,
//     batt FLOAT NULL,
//     PRIMARY KEY (tm, seq)    )
//   COLLATE='utf8_general_ci'
//   ENGINE=InnoDB `,
//   (err, dt) => {    if (err)  console.error(err);
//                      else console.info('* CREATE TABLE status_logs') ;
// });

setTimeout( () => {
    con.query("SELECT count(1) as devnum FROM motestatus where spare = 'N' ",
      (err, dt) => {
        if (err) DEVNUM = 6 ;
        else   DEVNUM = dt[0].devnum ;
        console.info('Mote num :'+ DEVNUM);
    });

    con.query( ' delete from status_logs where tm < DATE_ADD( now() , interval -6 month)',
            (err,res) => { if(err) console.log(err);  } ) ;
          },  2000);

async function getDevs() {
  if (! con.isconn ) {
    con = mysql_dbc.init();
    mysql_dbc.test_open(con);
    con.isconn = true ;
  }
  let tm = new Date() ;
  let status_all = new Array() ;
  const cli_dev = new ModbusRTU();
  cli_dev.connectTCP(GWIP, { port: DEVPORT })
  .then( async () => {
      let vincr = (DEVNUM*6 > 100) ? 100 : DEVNUM*6 ;
      let rapdev = [] ;
      await cli_dev.setID(1);
      for (let ii = 1; ii < DEVNUM*6 ; ii += vincr) {
        await cli_dev.readInputRegisters(ii, vincr)
        .then ( (d) => { rapdev = rapdev.concat(d.data) ;})
        .catch( (e) => {
          console.error( "apdev register read error");
          console.info(e);
        });
      }
      cli_dev.close();
//      let rapdev = new Uint16Array(rdev);
      for (let i=0; i < DEVNUM*6  ; i += 6) {
//        if ( rapdev[i] == 0) continue ;
        let d = (Math.floor( i / 6) + 1);
        let vbatt = rapdev[i+5] / 1000 ;
        status_all.push([ d, tm ,  rapdev[i+4],  vbatt  ]) ;
      }
  })
  .then( () => {
    if ( status_all.length > 0 ) {
        con.query('INSERT INTO status_logs (seq, tm,  act,  batt  ) values ?', [status_all],
         (err, res) => { if(err) console.log(err); }
        );
     }
  })
  .catch((e) => {
    console.error("getDevs()  error");
    console.info(e);
  });


}

setTimeout( main_loop,  3000) ;

async function main_loop() {
  let tm1 = new Date() ;
  await getDevs();
  let tm2 = new Date() ;
  let delay = 10000 - (tm2 - tm1) - 10 ;
  setTimeout( main_loop,  delay) ;
}

process.on('uncaughtException', function (err) {
	//예상치 못한 예외 처리
	console.error('uncaughtException 발생 : ' + err.stack);
  con.end() ;
  con.isconn = false ;
});
