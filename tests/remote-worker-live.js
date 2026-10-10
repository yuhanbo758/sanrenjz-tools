'use strict';
// 在隔离主程序中调用真实隐藏执行器；不替换插件核心或运行时。
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const {PDFDocument}=require('pdf-lib');
const {connectHost}=require('./remote-live-inspect');
const directory=path.resolve(__dirname,'../dist/remote-worker-live');fs.mkdirSync(directory,{recursive:true});
(async()=>{
  const host=await connectHost();
  try{
    const pdf=await PDFDocument.create();pdf.addPage([200,200]);const pdfFile=path.join(directory,'one.pdf');fs.writeFileSync(pdfFile,await pdf.save());
    const doc=path.join(directory,'notes.txt');fs.writeFileSync(doc,'Remote worker document: genuine local fixture.','utf8');
    const files=[{path:doc,name:'notes.txt',directory:false}],pdfs=[{path:pdfFile,name:'one.pdf',directory:false}];
    async function run(tool,input='',options={},selected=[]){const output=path.join(directory,`${tool}-${crypto.randomUUID()}.${tool==='pdf-organizer'?'pdf':tool==='archive-tool'?'zip':'png'}`);return host.evaluate(`global.mobileAcceptance.service.chat.job('tool',${JSON.stringify({call:{tool,input,options},files:selected,output})},30000)`);}
    const values=[];
    for(const [tool,input,options] of [['json-workbench','{"b":2,"a":1}',{}],['config-converter','{"hello":"world"}',{source:'json',target:'yaml'}],['xml-workbench','<root><a>1</a></root>',{}],['codec-assistant','hello',{action:'base64-encode'}],['hash-hmac','hello',{}],['id-generator','',{type:'uuid',count:2}],['time-converter','2026-10-06T00:00:00Z',{}],['date-world-clock','2026-10-06',{days:1}],['unit-converter','1000',{unitType:'length',fromUnit:'m',toUnit:'km'}],['calculation-paper','(2+3)*4',{}],['color-workbench','#6757db',{}],['text-diff','a\nb',{rightText:'a\nc'}],['line-processor','b\na\nb',{unique:true,sort:true}],['csv-table','name,age\nA,3',{action:'json'}],['regex-lab','abc123',{pattern:'\\d+',flags:'g'}]]){const result=await run(tool,input,options);assert(result!==undefined);values.push({tool,result});}
    assert(values.find(row=>row.tool==='codec-assistant').result==='aGVsbG8=');assert(values.find(row=>row.tool==='calculation-paper').result==='20');assert(values.find(row=>row.tool==='unit-converter').result==='1');
    const document=await run('document-read','',{},files);assert(document[0].text.includes('genuine local fixture'));assert.strictEqual(document[0].name,'notes.txt');
    const checksum=await run('file-checksum','',{},files);assert.strictEqual(checksum[0].sha256,crypto.createHash('sha256').update(fs.readFileSync(doc)).digest('hex'));
    const tree=await run('directory-tree','',{maxDepth:2},[{path:directory,name:'fixtures',directory:true}]);assert(tree.text.includes('notes.txt'));
    const search=await run('file-content-search','',{query:'genuine',extensions:['txt']},[{path:directory,name:'fixtures',directory:true}]);assert(JSON.stringify(search).includes('notes.txt'));
    const qr=await run('qr-barcode','LAN-only remote chat',{size:256});assert(fs.statSync(qr.artifact).size>100);const image=[{path:qr.artifact,name:'qr.png',directory:false}];
    const converted=await run('image-converter','',{format:'jpg'},image);assert(fs.statSync(converted.artifact).size>100);
    const resized=await run('image-resizer','',{width:100,height:100},image);assert.deepStrictEqual(resized.dimensions,{width:100,height:100});
    const merged=await run('pdf-organizer','',{},pdfs);assert((await PDFDocument.load(fs.readFileSync(merged.artifact))).getPageCount()===1);
    const archive=await run('archive-tool','',{action:'create'},files);assert(fs.statSync(archive.artifact).size>50);await run('archive-tool','',{action:'inspect'},[{path:archive.artifact,name:'archive.zip',directory:false}]);
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({textTools:values.map(row=>row.tool),fileTools:['document-read','file-checksum','directory-tree','file-content-search','qr-barcode','image-converter','image-resizer','pdf-organizer','archive-tool'],count:24,mode:'real Electron 25 worker and existing plugin cores'},null,2));
    console.log('REMOTE_WORKER_LIVE_PASS: 24 个业务接口在真实 Electron 隐藏执行器中通过');
  }finally{host.socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
