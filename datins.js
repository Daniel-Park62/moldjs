"use strict";
let DEVNUM = 2 ;
let SSNUM = 6 ;
const TAGPORT = 1502;
const DEVPORT = 1503;

let GWIP = process.env.GWIP || "192.168.0.233" ;
let port = process.env.RESTPORT || 9977 ;
let PLACE = process.env.PLACE || 0 ;  // 0.공장  1.수리장
console.info( "GateWay :" + GWIP , "PLACE : " + PLACE );

const moment = require('moment') ;
const express    = require('express');
const app        = express();
const net = require('net');
app.use(express.json()) ;

const mysql_dbc = require('./db/db_con')();
let con = mysql_dbc.init();
mysql_dbc.test_open(con);
con.isconn = true ;


require('date-utils');

let moteinfo = require('./api/moteinfo');
let apinfo = require('./api/apinfo');
let rdata = new Uint16Array(DEVNUM) ;
let MEAS = 5;
let svtime = moment().subtract(34,"s");

//let GWIP = process.argv[2] || "192.168.8.98" ;

const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let sAct = [];

app.get('/', (req, res) => {
  res.send('<h2>(주)다윈아이씨티 : Posco 무선 온습도 모니터링 입니다  </h2>\n');
//  console.info(req.query) ;
  if (req.query.meas != null)  MEAS = req.query.meas ;
  console.info('time interval :'+ MEAS);
 });


app.get('/reload', (req, res) => {
   res.send('<h2>Data Reload</h2>\n');
  console.info('getMeasure() call ');
  getMeasure() ;
});

app.get('/reset_ob', (req, res) => {
   res.send('<h2>Sensor OB reset</h2>\n');
   if (req.query.seq != null) {
      console.info('Sensor OB reset :' + req.query.seq);
      moteOBReset(req.query.seq) ;
   } else {
     console.error('Sensor OB reset sensor No not input !!');
   }

});

function moteOBReset(sno) {
      con.query('UPDATE motestatus SET obcnt = 0  where seq = ? ' ,[sno ],
        (err, dt) => {
          if (err) console.error(err);
        });
}

let MAXTEMP =200 , MINTEMP =0 , MAXHUMI = 90 ,MINHUMI = 0 ;

function getMeasure() {
  con.query("SELECT seq,act,place,mold, loc, GUBUN FROM motestatus where spare = 'N'   ",
    (err, dt) => {
      if (!err) {
        // motesmac = JSON.parse(JSON.stringify(dt)) ;
        dt.forEach((e,i) => { sAct[e.seq] = [] ; sAct[e.seq] = [e.act, e.place, e.mold, e.loc]  }) ;

      } else console.error(err);
  });

  con.query("SELECT measure, maxtemp, mintemp, maxhumi, minhumi FROM MOTECONFIG LIMIT 1",
    (err, dt) => {
      if (err) MEAS = 10 ;
      else   {
        MEAS = dt[0].measure ;
        MAXTEMP = dt[0].maxtemp ;
        MINTEMP = dt[0].mintemp ;
        MAXHUMI = dt[0].maxhumi ;
        MINHUMI = dt[0].minhumi ;
      }
      console.info('time interval :'+ MEAS, " 온도 :" + MINTEMP , " ~ " , MAXTEMP
                  , " 습도 :" + MINHUMI + " ~ ",MAXHUMI);
  });
  con.query("SELECT max(seq) as ssnum FROM motestatus where spare = 'N' and GUBUN = 'S' ",
    (err, dt) => {
      if (err) SSNUM = 8 ;
      else   SSNUM = dt[0].ssnum ;
      console.info('Sensor num :'+ SSNUM);
  });
  con.query("SELECT count(1) as devnum FROM motestatus where spare = 'N' ",
    (err, dt) => {
      if (err) DEVNUM = 6 ;
      else   DEVNUM = dt[0].devnum ;
      console.info('Mote num :'+ DEVNUM);
  });

  con.query("SELECT lastm FROM lastime where id = ? ",[PLACE],
    (err, dt) => {
      if (!err) svtime = moment(dt[0].lastm) ;
      console.info('last time :'+ svtime.format('YYYY-MM-DD HH:mm:ss')) ;
  });
}


con.query( ' delete from motehist where tm < DATE_ADD( now() , interval -6 month)',
        (err,res) => { if(err) console.log(err);  } ) ;

if (PLACE == 0)
  app.listen(port, function(){
    console.log('listening on port:' + port);
  });

function getDevs() {
  if (! con.isconn ) {
    con = mysql_dbc.init();
    mysql_dbc.test_open(con);
    con.isconn = true ;
  }
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
        let vmac = (rapdev[i] & 255).toString(16).padStart(2,'0') +':' + (rapdev[i] >>>8).toString(16).padStart(2,'0') + ':'
                 + (rapdev[i+1] & 255).toString(16).padStart(2,'0') +':' + (rapdev[i+1] >>>8).toString(16).padStart(2,'0') + ':'
                 + (rapdev[i+2] & 255).toString(16).padStart(2,'0') +':' + (rapdev[i+2] >>>8).toString(16).padStart(2,'0') + ':'
                 + (rapdev[i+3] & 255).toString(16).padStart(2,'0') +':' + (rapdev[i+3] >>>8).toString(16).padStart(2,'0') ;
        let vbatt = rapdev[i+5] / 1000 ;
        let motestatus = {"seq": d, "mac":vmac, "act" : rapdev[i+4], "batt" : vbatt  };
        try {
          if (sAct[d] != undefined )
            sAct[d][0] = rapdev[i+4] ;
        } catch (e) {
            console.error(d, " seq value") ;
        }
        if (rapdev[i+4] > 0) {
          con.query('UPDATE motestatus SET MAC = ?, ACT = ? , BATT = ? , place = ? where seq = ? ',[motestatus.mac, motestatus.act, motestatus.batt,PLACE, d],
           (err, res) => { if (err) console.error("Update motestatus :", err); }
          );
        } else {
          con.query('UPDATE motestatus  SET ACT = ?  where seq = ? and place = ? ',[ motestatus.act, d, PLACE],
           (err, res) => { if (err) console.error("Update motestatus :", err); }
          );
        }
      }
  })
  .catch((e) => {
    console.error("getDevs()  error");
    console.info(e);
  });

}

async function insTemp() {

  let rtags = new Uint16Array(5) ;
  client.close();
  let motearr = new Array() ;
  const today = nextt ;  //moment();
  const tm = today.format('YYYY-MM-DD HH:mm:ss');

  client.connectTCP(GWIP, { port: TAGPORT })
  .then( async () => {
     await client.setID(1);

      let devs = SSNUM*5;

    //  async () => {
        for (let ii = 0; ii < 8 ; ii++ ) {
          await  client.readInputRegisters(ii*5+1, 5)
          .then ( (d) => {
            rtags = new Uint16Array(d.data);
            if (sAct[ii+1] != undefined )
              if (sAct[ii+1][0] == 2)
                 motearr.push( [PLACE, sAct[ii+1][2], sAct[ii+1][3], ii+1, 2, tm, rtags[0] / 100.0 , rtags[1]/100.0 , rtags[2]/100.0, rtags[3]/100.0, rtags[4] ]) ;
              else {
                con.query("SELECT seq, place, act FROM motestatus where seq = ? and gubun = 'S' and spare = 'N' and place = ? ",[ ii+1 , PLACE ],
                  (err, dt) => {
                    if (!err && dt.length > 0) motearr.push( [PLACE, sAct[ii+1][2], sAct[ii+1][3], dt[0].seq, 0 , tm, 0,0,0,0,0 ]) ;
                });
               }
          })
          .catch( (e) => {
            console.error( " ** register read error **");
            console.info(e);
          });
        }
        let ii = 31 ;
        for (let ij = 0; ij < 8 ; ij++ ) {
          await  client.readInputRegisters(ij*5+65, 5)
          .then ( (d) => {
            rtags = new Uint16Array(d.data);
            ii++ ;
            if (sAct[ii+1] != undefined )
              if (sAct[ii+1][0] == 2)
                 motearr.push( [PLACE, sAct[ii+1][2], sAct[ii+1][3], ii+1, 2, tm, rtags[0] / 100.0 , rtags[1]/100.0 , rtags[2]/100.0, rtags[3]/100.0, rtags[4] ]) ;
              else {
                con.query("SELECT seq, place, act FROM motestatus where seq = ? and gubun = 'S' and spare = 'N' and place = ? ",[ ii+1 , PLACE ],
                  (err, dt) => {
                    if (!err && dt.length > 0) motearr.push( [PLACE, sAct[ii+1][2], sAct[ii+1][3], dt[0].seq, 0 , tm, 0,0,0,0,0 ]) ;
                });
               }
          })
          .catch( (e) => {
            console.error( " ** register read error **");
            console.info(e);
          });
        }

  })
  .then(() => {
    if ( motearr.length > 0 ) {
        con.query('INSERT INTO moteinfo (place, mold, loc, seq, act,  tm, temp, humi,temp2,humi2 ,humi_adc  ) values ?', [motearr],
         (err, res) => { if(err) console.log(err); }
        );
     }
       con.query('UPDATE lastime SET lastm = ? where id = ?', [ tm, PLACE ],
       (err, res) => {
                        if(err) {
                          console.log("update lastime :"+ err);
                          con.end() ;
                          con.isconn = false ;
                        }
                    }
       );
  })
  .then(() => {
    con.query('update motestatus set obcnt = 1 where seq in ( select seq from vsensordata where tm = ? and outb = 1)',[tm],
     (err, res) => { if(err) console.log(err); }
     );

  })
  .catch((e) => {
    console.error("insTemp()  error 발생");
    console.info(e);
  });
}

let csec =  moment().get('second') ;

getMeasure() ;
client.connectTCP(GWIP, { port: TAGPORT }) ;

async () => { while (sAct[1][0] == "undefined")  await sleep(1000) ; }

let nextt = moment( moment().set({'second': Math.ceil( csec / MEAS ) * MEAS, 'millisecond':0 }) );

setTimeout( main2_loop,  2000) ;

setTimeout( main_loop,  nextt - moment() ) ;
setInterval(() => {
  con.query('INSERT INTO motehist (id, act, place, mold, loc, tm, seq, temp, humi, temp2, humi2, humi_adc) \
             select id,  act, place, mold, loc, tm, seq, temp, humi, temp2, humi2, humi_adc \
             from moteinfo x where not exists (select 1 from motehist where id = x.id) ',
   (err, res) => { if(err) console.log(err); }
 );
}, 30000) ;
setInterval(() => {
  con.query( ' delete from moteinfo where tm < DATE_ADD( now() , interval -24 HOUR)',
          (err,res) => { if(err) console.log(err); } ) ;
}, 600000) ;

async function main_loop() {
  // console.info(nextt) ;
  // let tm1 = moment();
  insTemp() ;
  await sleep(2000) ;
  csec =  moment().get('second') ;
  nextt = moment( moment().set({'second': Math.ceil( csec / MEAS ) * MEAS, 'millisecond':0 }) );

  // let tm2 = moment();
  // let delay = MEAS * 1000 - (nextt - tm1) - 10 ;
  setTimeout( main_loop,  nextt - moment() ) ;

}

async function main2_loop() {
  let tm1 = new Date() ;
  await getDevs();
  let tm2 = new Date() ;
  let delay = 1000 - (tm2 - tm1) - 10 ;
  setTimeout( main2_loop,  delay) ;
}

process.on('uncaughtException', function (err) {
	//예상치 못한 예외 처리
	console.error('uncaughtException 발생 : ' + err.stack);
  con.end() ;
  con.isconn = false ;
});
