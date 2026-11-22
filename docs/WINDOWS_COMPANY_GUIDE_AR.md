# دليل AutoParts Business على Windows

## جرّب الخدمة على هاد الجهاز

معاينة Demo السابقة كاينة فـ http://127.0.0.1:4175/ . للتدريب على مخزون كبير، نسخة الشركة المحلية خدامة بعنوان https://127.0.0.1:4265/ على نفس الحاسوب. فمجلد التدريب الخاص على D، افتح `Open AAA Sales.cmd` للبائع أو `Open AAA Owner.cmd` للمالك. الاختصارات كتفتح متصفحاً منفصلاً وتتحقق من شهادة التدريب. كل حسابات هاد النسخة اصطناعية، وكل الكميات للتجربة. ملف `training-assortment/AAA-training.csv` داخل المجلد الخاص فيه الـ10,728 مرجع التدريبي.

من الكتالوج قلّب على `QA-NGK-CR9EK` باش تشوف صورة البوجي ورقم الصانع. من البيع، اختار **Comptoir AAA** وكتب `QA-CR9EK` واضغط Enter لمحاكاة قارئ الباركود. شوف الكمية والمبلغ قبل تأكيد البيع. بدّل AR أو FR أو EN حتى من داخل الوصل. إلا تقطع الاتصال من بعد التأكيد، رجّع الاتصال واستعمل إعادة المحاولة على نفس العملية. بيع جديد كيحتاج الاتصال بقاعدة المخزون.

## تثبيت شركة جديدة على حاسوب Windows

هاد المسار محلي على حاسوب واحد. استعمل PowerShell 7، ‏Node 24.16.x، ‏PostgreSQL 18 مع أدواته فـPATH، وGit for Windows اللي فيه OpenSSL 3. افتح PowerShell من مجلد النسخة المعتمدة وشغّل `npm.cmd ci` أول مرة. قبل البداية حدّد الاسم اللي خاص يبان فالوصل، اسم المالك وبريده. المسار التالي مثال لمجلد **جديد** على D. التثبيت كيخلق PostgreSQL مستقل، مخزن MAIN، رف الاستلام ودعوة مالك. دفتر الشركة كيبدا خاوي.

```powershell
$companyDir = 'D:\AutoParts\Company01'
$companyName = Read-Host 'اسم الشركة'
$ownerName = Read-Host 'اسم المالك'
$ownerEmail = Read-Host 'بريد المالك'
pwsh -File scripts/company-windows.ps1 -Action Install -Directory $companyDir -CompanyName $companyName -OwnerName $ownerName -OwnerEmail $ownerEmail -Language ar
```

عنوان التثبيت الافتراضي هو https://127.0.0.1:4267/ . أداة التثبيت كتطبع العنوان المستعمل. الملفات والتذاكر داخل مجلد خاص بحساب Windows اللي ثبّت الشركة. قبل الدخول من المتصفح العادي، المسؤول كيتحقق من بصمة الشهادة المحلية `localhost.crt` وكيعتمد **الشهادة العمومية فقط** لحساب Windows المخصص. للاختبار يمكن استخدام متصفح منفصل يثق بتلك الشهادة فقط. المفتاح `localhost.key` كيبقى خاص. للوصول من تابلت عبر Wi-Fi اتبع [دليل شبكة المحل](SHOP_NETWORK_HANDOFF.md).

1. المالك كيفتح «تفعيل الدعوة»، كياخد التذكرة من الملف الخاص `owner-ticket` وكيحققها فالتطبيق. مدة الدعوة 24 ساعة. فحالة الانتهاء قبل التفعيل كاين مسار التجديد فدليل الشبكة.
2. يختار كلمة سر ويسجّل مفتاح المصادقة فالتطبيق الموثوق ديالو، ويدخل الرمز الحالي من ستة أرقام. للدخول يستعمل بريده وكلمة السر والرمز ديال موبايلو.
3. من «الفريق والصلاحيات» كيدعو كل موظف بوحدو ويحدد الدور والمستودع. يوصل تذكرة كل واحد على انفراد.
4. أمين المخزن كيدخل الجرد الافتتاحي حسب الرف. شخص آخر مخوّل كيراجعو ويوافق عليه. البائع كيمسح المرجع، كيتحقق من المستودع والكمية ومن بعد كيصدر الوصل. إعداد الضريبة ومضمون الوثيقة الرسمية كيعتمدهم المحاسب.

## التشغيل اليومي والتحديث

```powershell
pwsh -File scripts/company-windows.ps1 -Action Start  -Directory $companyDir
pwsh -File scripts/company-windows.ps1 -Action Status -Directory $companyDir
pwsh -File scripts/company-windows.ps1 -Action Stop   -Directory $companyDir
```

من بعد إعادة تشغيل Windows استعمل Start. للتحديث، خذ نسخة احتياطية وجرب استرجاعها، سدّ الخدمة بـStop، حضّر مجلد إصدار جديد مطابق لـGitHub، وشغّل `npm.cmd ci` داخلو. من نفس المجلد استعمل `pwsh -File scripts/company-windows.ps1 -Action Update -Directory $companyDir`. الأداة كتراجع بصمات الهجرات وكتعيد بناء التطبيق وتشغيله. خليه محتافظ بمجلد الإصدار السابق وبالنسخة الاحتياطية. للرجوع لإصدار قديم بعد تغييرات فالبيانات، افتح نسخة مسترجعة منفصلة مع الكود الموافق وراجعها قبل أي تحويل ديال خدمة الموظفين.

## النسخة المشفّرة والاسترجاع

المسؤول كيحتاج شهادة تشفير ومفتاح الاسترجاع المقابل. لإعداد زوج جديد فمجلد محمي ومنفصل، استعمل OpenSSL 3. الأمر التالي كيطلب عبارة مرور للمفتاح. احتفظ بنسخة من المفتاح وعبارة المرور فمكان خاص مستقل عن الحاسوب.

```powershell
$env:OPENSSL_BIN = 'D:\Git\usr\bin\openssl.exe'
& $env:OPENSSL_BIN req -x509 -newkey rsa:3072 -days 730 -subj '/CN=AutoParts Backup' -keyout recovery-key.pem -out recovery-cert.pem
node scripts/company-recovery.mjs backup $companyDir recovery-cert.pem D:\Backups\company-001.cms
Get-FileHash D:\Backups\company-001.cms -Algorithm SHA256
```

أثناء النسخ خليه PostgreSQL خدام. خزّن الأرشيف المشفّر على جهاز أو وسيط آخر، وطابق بصمة SHA-256 بعد النقل. فالتجربة المحلية استعملنا مفتاح اختبار محمياً بصلاحيات Windows. إذا كان المفتاح محمياً بعبارة مرور، خدم من نافذة PowerShell ديالك وأدخل العبارة ملي يطلبها OpenSSL. عند الاسترجاع كيحتاج المسؤول قاعدة PostgreSQL شغالة وحساب التطبيق المحدود الموجود عند التثبيت. فخادم استرجاع جديد، حضّر نفس دور التطبيق المحمي أولاً وراجع بيانات الاتصال. ما توصل حتى جهاز بيع بقاعدة الاختبار قبل المراجعة.

```powershell
node scripts/company-recovery.mjs restore D:\Backups\company-001.cms recovery-cert.pem recovery-key.pem "$companyDir\admin.env" D:\AutoParts\RestoreTrial company_restore_001
```

الأداة كتتحقق من تشفير الأرشيف وبصمات مكوناته وكتخلق قاعدة ومجلد جديدين. ملف `application.env` داخل مجلد الاسترجاع كيشير للقاعدة والوسائط المسترجعة. لاختبار الدخول بالتوازي، اختار منافذ loopback مختلفة فـ`API_PORT` و`APP_ORIGINS` ديال **النسخة المسترجعة**. شغّلها من مجلد الإصدار باستعمال `node --import=tsx scripts/company-local.mjs start D:\AutoParts\RestoreTrial`. طابق سجلات المخزون والوصل والصورة، وجرّب حساب المالك والموظف. أي تحويل نهائي للمحل قرار مستقل ديال المالك.
