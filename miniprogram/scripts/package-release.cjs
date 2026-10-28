const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
if (!['staging', 'production'].includes(target)) throw new Error('Expected staging or production')
const sha = process.env.RELEASE_SHA
const releaseId = process.env.RELEASE_ID
if (!/^[0-9a-f]{40}$/.test(sha || '') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(releaseId || '')) {
  throw new Error('Missing release SHA or ID')
}
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'miniprogram', target === 'staging' ? 'dist-staging' : 'dist')
if (!fs.existsSync(path.join(output, 'app.json'))) throw new Error('Compile the mini-program before packaging')
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
project.miniprogramRoot = './'
project.projectname = 'linkmai-' + target
project.setting.urlCheck = true
fs.writeFileSync(path.join(output, 'project.config.json'), JSON.stringify(project, null, 2) + '\n')
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({ sha, releaseId, environment: target }, null, 2) + '\n')
console.log('Packaged ' + target + ' mini-program: ' + releaseId)
