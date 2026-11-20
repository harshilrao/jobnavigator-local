import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import * as api from '@/lib/api';

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the shell with navigation and login page when not authenticated', () => {
    const html = renderToString(<App />);
    expect(html).toContain('JobNavigator Local');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Sign in');
  });

  it('renders the dashboard when authenticated', () => {
    // Mock getCurrentUser to return a user
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: '1', email: 'test@example.com' });
    const html = renderToString(<App />);
    expect(html).toContain('JobNavigator Local');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Welcome to JobNavigator Local');
  });
});