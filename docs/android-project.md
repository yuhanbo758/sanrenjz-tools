# 手机遥控 Android 项目与分发

Android 源码独立维护于 `D:\wenjian\python\develop\Android\sanrenjz-tools-remote`，不在桌面仓库的 `android` 子目录继续维护。迁移时 29 个源文件逐文件 SHA-256 一致，含 Kotlin、WebView 界面、Gradle Wrapper、应用图标和第三方许可证。

应用“三人聚智遥控”的包名为 `com.sanrenjz.tools.remote`，手机版本 1.6.0 / versionCode 7，Android 8 及以上。电脑插件 1.7.0 与手机版本独立；手机使用局域网连接用户自己的电脑，不依赖开发者的公网域名、服务器或模型账号。

在 Android 项目根目录执行 `gradlew.bat assembleRelease`，再用 `python scripts/sign-release.py` 复用本机长期发布签名。首次初始化签名需取得明确授权，密码由 `password-manager` 加密保管；仓库和应用均不包含签名密码。完整构建说明见 Android 项目的 README。

发给他人的文件是 Android 项目中的 `release/sanrenjz-remote-1.6.0-release.apk`。不要发送 `app-release-unsigned.apk`、开发调试包、签名密钥或密码数据库。手机首次安装需允许安装来源；电脑端同时需要兼容主程序和“媒体投放接收器”插件，扫码连接同一局域网。

开发测试手机此前使用调试签名，不能用另一发布签名直接覆盖。不得为了验证发布包而自动卸载旧包或清除手机配对资料。后续发布 APK 必须继续使用同一发布签名。
