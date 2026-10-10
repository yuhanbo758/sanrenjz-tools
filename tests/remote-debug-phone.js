const {connectPhone}=require('./remote-main-live');
(async()=>{const phone=await connectPhone();try{console.log(JSON.stringify(await phone.evaluate(process.argv[2]||'({connected,status:document.getElementById("status").textContent,pending:pending.size})')));}finally{phone.socket.close();}})().catch(error=>{console.error(error.message);process.exit(1);});
