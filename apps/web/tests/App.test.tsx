import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';

describe('App', () => {
  it('renders the shell with navigation and a dashboard', () => {
    const html = renderToString(<App />);
    expect(html).toContain('JobNavigator Local');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Welcome to JobNavigator Local');
  });
});
