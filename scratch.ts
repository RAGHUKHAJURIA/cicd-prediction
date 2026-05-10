import { parseJenkinsfile } from './src/parsers/jenkinsfile.parser';
const out = parseJenkinsfile(`node('linux') { stage('Build') { sh 'npm ci' } }`, 'Jenkinsfile', 'repo');
console.log(JSON.stringify(out, null, 2));
