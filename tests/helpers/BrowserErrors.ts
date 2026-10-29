import type { Page } from '@playwright/test';
import { isExpectedMusicCancellation } from './ExpectedMusicCancellation.ts';

export function watchBrowserErrors(page: Page, options: {
  webgl?: boolean;
  requests?: boolean;
  deploymentBase?: string;
} = {}): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`Uncaught: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' || options.webgl && /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(`Console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  if (options.requests) page.on('requestfailed', request => {
    if (!isExpectedMusicCancellation(request, options.deploymentBase ?? page.url())) errors.push(`Failed request: ${request.url()}`);
  });
  if (options.deploymentBase) {
    const base = new URL(options.deploymentBase);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) errors.push(`Request escaped the deployment directory: ${request.url()}`);
    });
  }
  return errors;
}
