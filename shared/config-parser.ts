import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const config = await readFile('../config.yaml', 'utf8');

export default YAML.parse(config);
