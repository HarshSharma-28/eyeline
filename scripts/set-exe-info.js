// Set Eyeline.exe icon and version strings (pure JS, no Wine needed).
const fs = require('fs'); const ResEdit = require('resedit'); const PE = require('pe-library');
const exePath = process.argv[2], icoPath = process.argv[3];
const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Eyeline', FileDescription: 'Eyeline teleprompter', CompanyName: 'Eyeline', OriginalFilename: 'Eyeline.exe', InternalName: 'Eyeline', LegalCopyright: '' });
const [ma, mi, pa] = require('../package.json').version.split('.').map(n => parseInt(n, 10) || 0);
vi.setFileVersion(ma, mi, pa, 0, 1033); vi.setProductVersion(ma, mi, pa, 0, 1033);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('exe updated');
