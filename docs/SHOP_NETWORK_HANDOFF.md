# تشغيل AutoParts Business داخل المحل

يمكن لفريق المحل استعمال نفس التطبيق ونفس المخزون عبر شبكة محلية خاصة. يفتح كل موظف عنوان HTTPS نفسه من متصفح التابلت أو الهاتف ويسجل الدخول بحسابه. يتطلب هذا المسار جهازاً في المحل يظل مشغلاً واتصال الأجهزة بشبكته. الوصول من خارج المحل يحتاج شبكة خاصة موثوقة تُجهّز على حدة.

## ما يحدده المالك

- الجهاز المخصص للخدمة، والعنوان المحلي الثابت الذي ستستعمله الأجهزة.
- اسم الشركة كما سيظهر على الوصل، وبريد المالك، وأسماء المستودعات ورموزها.
- أسماء الموظفين وصلاحية كل واحد والمستودع المسموح له.
- الجرد الافتتاحي الفعلي، والصور المرخّصة، والتوافق المراجع، وإعداد الضريبة الذي اعتمده المسؤول عن المحاسبة.

قاعدة الشركة تبدأ فارغة. أداة التهيئة ترفض قاعدة فيها مؤسسة قائمة. تبقى نسخة العرض مستقلة.

## Installation for the shop's administrator

Use a Linux Docker Compose host on the approved private network. Keep the company installation in its own folder. Reserve its IP, configure local DNS if using a name, and restrict inbound TCP 443 to the approved shop network. Keep the host on while the team is working.

1. Outside the source checkout, create an owner-readable environment file. Set `COMPANY_HOST` to the exact local host name or IP that employees will enter. Set `COMPANY_BIND_IP` to the corresponding LAN interface IP. The default binding is loopback for an isolated rehearsal. Set `COMPANY_ADMIN_PASSWORD`, `COMPANY_DB_PASSWORD` and `COMPANY_MFA_KEY` to three separate random 64-character hexadecimal strings. Keep these secrets in protected storage.
2. From the checkout root, select the new stack and start the services. Its PostgreSQL, private media and TLS volumes are independent of demo and staging. Only the gateway publishes a port.

```bash
export COMPOSE_FILE="$PWD/infrastructure/company.compose.yaml"
export COMPANY_ENV=/secure/autoparts/company.env
docker compose --env-file "$COMPANY_ENV" config --quiet
docker compose --env-file "$COMPANY_ENV" up -d --build
```

3. Extract the local root **certificate** and check its SHA-256 fingerprint on the host. Distribute the certificate through the company's trusted device administrator. Install and enable trust on each approved phone/tablet after checking the fingerprint. Open the chosen HTTPS address and verify it opens with a trusted connection. The signing key stays on the host.

```bash
docker compose --env-file "$COMPANY_ENV" cp gateway:/data/caddy/pki/authorities/local/root.crt /secure/autoparts/shop-root.crt
openssl x509 -in /secure/autoparts/shop-root.crt -noout -fingerprint -sha256
```

4. Create a private `company.json` with the agreed details. This example uses fictional values. The database name must match the target. Use the complete initial warehouse list.

```json
{
  "database": "autoparts_company",
  "company": "Example Atelier",
  "locale": "ar",
  "owner": { "name": "Example Owner", "email": "owner@example.invalid" },
  "warehouses": [{ "code": "MAIN", "name": "Main counter" }]
}
```

5. Generate the first owner's invitation. The commands route it to a new private file. Use a private directory for both files, and a fresh filename for each issuance. The only secret sent to the owner at this stage is the activation ticket. Send it on the company's approved private channel.

```bash
umask 077
docker compose --env-file "$COMPANY_ENV" exec -T api sh -c 'umask 077; cat > /tmp/company.json' < /secure/autoparts/company.json
docker compose --env-file "$COMPANY_ENV" exec -T api node --import=tsx apps/api/src/setup-company.ts /tmp/company.json /tmp/owner-ticket-01
( set -C; docker compose --env-file "$COMPANY_ENV" exec -T api cat /tmp/owner-ticket-01 > /secure/autoparts/owner-ticket-01 )
```

An unclaimed ticket expires after 24 hours. The administrator can repeat the setup command with the same company and owner email, a **new** ticket filename, and `--renew` as the final argument. This invalidates the earlier ticket. Once an owner has activated, renewal and repeated setup refuse to create another account.

## أول نهار ديال الخدمة

1. **المالك** يفتح عنوان المحل، يختار اللغة من الفوق، ويضغط «قبول الدعوة». يلصق رمز الدعوة ويختار كلمة سر. يضيف مفتاح الإعداد لتطبيق المصادقة ويدخل الرمز الحالي ديال ستة أرقام. من بعد يسجل الدخول بالبريد وكلمة السر ورمز المصادقة.
2. **فلوحة المالك** كيبان «تجهيز نقطة البيع». كل خطوة كتفتح الشاشة المناسبة. المؤشرات جاية من السجلات الفعلية: حساب موظف مفعّل، قطعة مفعلة للبيع، أول دخول للمخزون، وإعداد الضريبة. اكتمال هاد المؤشرات ما كيعوّضش مطابقة الجرد والمراجعة المحاسبية.
3. **فالفريق والصلاحيات** المالك يوجه دعوة لكل موظف بالدور والمستودع المناسبين. الموظف يفعّل الحساب بنفسه. يضبط المالك إعدادات الضريبة بعد مراجعة المحاسب.
4. **فالكتالوج** يسجل الفريق القطعة بمراجعها وترجماتها. الصور كتدخل للمراجعة. في غياب صورة مؤكدة كيبقى الرسم معلماً. التوافق مع السيارة كيحتاج الدليل ديالو.
5. **فالمخزون** الفريق يسجل الجرد الافتتاحي المصادق عليه أو الاستلام الفعلي. **فنقطة البيع** الكاشي يمسح المرجع أو يبحث عليه، ويراجع الكمية والثمن قبل التأكيد. إلا انقطع الاتصال وكانت نتيجة العملية معلقة، يستعمل زر إعادة نفس الطلب. تغيير اللغة كيبقى على نفس السلة والوصل.
6. قبل الاعتماد عليه فالبيع اليومي، دوزو تجربة على أجهزة المحل بالقارئ والطابعة: بيع، استلام، جرد، تبديل الموظف واللغة، انقطاع الشبكة ثم الاسترجاع، ومقارنة الوصل والحركات بالجرد. في نهاية التجربة يدون المسؤول النتيجة.

## Backup and recovery

On the private host, provision GNU tar, GnuPG and the verified public encryption key of the designated recovery custodian. The private decryption key must be recoverable separately. Run from the checkout root, with a private encrypted temporary filesystem if the host disk is not already encrypted.

```bash
bash scripts/backup-company.sh "$COMPANY_ENV" "$RECOVERY_KEY_FINGERPRINT" /secure/backups/company-unique-date.tar.gpg
```

The archive includes the PostgreSQL dump, content-addressed media, private TLS state, the installation environment including the MFA key, and a checksums file. The command refuses to replace an existing archive. Copy the encrypted result off the host. Set backup frequency, retention and an accountable recipient for missed backups before the pilot.

For a recovery drill, decrypt into a new private directory, verify `sha256sum -c SHA256SUMS`, restore the dump with `pg_restore --exit-on-error --no-owner --no-acl` to a **new** database owned by the application role, and restore media into a separate private volume. Verify stored receipts, balances, media references and MFA access before switching traffic. The company-network workflow contains an executable clean-room restore example. A completed backup job alone does not verify that the custodian can restore it.

## Evidence and release boundary

[Implementation, CI and reviewed scope](https://github.com/salbatro-p/Auto-piece-nidam/pull/10). The two CI jobs cover the Business regression suite and an isolated HTTPS shop rehearsal. The latter exercises the installer, privileged MFA, staff activation, replay of a sale, translated receipts, persistence across restart, and an encrypted backup restored separately. The original demo database remains separate. Physical devices, company data, authorized media, independent language/security review and operational sign-off belong to the shop pilot. [Acceptance gates](ACCEPTANCE_REPORT.md).
