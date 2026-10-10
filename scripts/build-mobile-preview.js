'use strict';
const {build,Platform,Arch}=require('electron-builder');
const fs=require('fs'),path=require('path'),project=require('../package.json');
// 使用完整配置文件，避免 builder 把资源数组与 package.build 合并后重复复制被排除的私有插件。
const base=project.build,config={...base,npmRebuild:false,directories:{...base.directories,output:'dist/mobile-delivery/desktop-connection-1.5.0-verified'},
  files:[...base.files,'!app/software/sanrenjz-tools-video-parser/**'],
  extraResources:base.extraResources.map(item=>item.from==='app'?{...item,filter:[...item.filter,'!software/sanrenjz-tools-video-parser/**']}:item),
  nsis:{...base.nsis,artifactName:`sanrenjz-tools-${project.version}-connection-preview-x64.exe`}};
const file=path.resolve(__dirname,'../dist/mobile-delivery/connection-builder.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(config,null,2));
// 始终生成独立预览目录，不发布，也不写入普通发布输出目录。
build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:file}).catch(error=>{console.error(error);process.exitCode=1;});
