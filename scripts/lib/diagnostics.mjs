// @ts-check
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

/** @satisfies {import('node:util').ParseArgsOptionsConfig} */
export const DIAGNOSTIC_OPTIONS = {
  url: { type: 'string' }, output: { type: 'string' },
  channel: { type: 'string' }, executable: { type: 'string' }, cdp: { type: 'string' },
  headed: { type: 'boolean' }, software: { type: 'boolean' }, help: { type: 'boolean' },
};

/** @typedef {{url?: string, output?: string, channel?: string, executable?: string,
 * cdp?: string, headed?: boolean, software?: boolean, help?: boolean}} DiagnosticValues */

/** Shared CLI > environment > tool default precedence. Hardware tools still own their GPU assertions.
 * @param {DiagnosticValues} values
 * @param {DiagnosticValues} defaults
 * @param {NodeJS.ProcessEnv} env
 */
export function diagnosticOptions(values = {}, defaults = {}, env = process.env) {
  if (values.help) {
    console.log('Diagnostic options: --url URL --output PATH --channel NAME --executable PATH --cdp URL --headed --software --help');
    console.log('Environment: SPECIMEN_DIAGNOSTIC_URL, SPECIMEN_DIAGNOSTIC_OUTPUT, SPECIMEN_BROWSER_CHANNEL, SPECIMEN_BROWSER_EXECUTABLE, SPECIMEN_CDP_URL');
    console.log('Tool defaults:', JSON.stringify(defaults));
    process.exit(0);
  }
  const url = new URL(values.url ?? env.SPECIMEN_DIAGNOSTIC_URL ?? env.SPECIMEN_PRODUCTION_URL ?? defaults.url ?? 'http://127.0.0.1:4173/group-folder/');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Diagnostic --url must use HTTP(S).');
  const cdp = values.cdp ?? env.SPECIMEN_CDP_URL ?? env.SPECIMEN_BROWSER_CDP_URL ?? defaults.cdp;
  const software = values.software ?? defaults.software ?? false;
  if (cdp && software) throw new Error('--software cannot configure an externally owned CDP browser.');
  return {
    url: url.href,
    output: resolve(values.output ?? env.SPECIMEN_DIAGNOSTIC_OUTPUT ?? defaults.output ?? 'artifacts/diagnostics'),
    channel: values.channel ?? env.SPECIMEN_BROWSER_CHANNEL ?? defaults.channel,
    executable: values.executable ?? env.SPECIMEN_BROWSER_EXECUTABLE ?? defaults.executable,
    cdp, software, headed: values.headed ?? defaults.headed ?? false,
  };
}

/** @param {ReturnType<typeof diagnosticOptions>} options
 * @param {import('@playwright/test').LaunchOptions} launch
 */
export function launchDiagnosticBrowser(options, launch = {}) {
  if (options.cdp) return chromium.connectOverCDP(options.cdp);
  return chromium.launch({
    ...launch, channel: options.channel, executablePath: options.executable, headless: !options.headed,
    args: [...(launch.args ?? []), ...(options.software ? ['--use-gl=angle', '--use-angle=swiftshader'] : [])],
  });
}
