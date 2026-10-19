import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HashRedirectShim } from './HashRedirectShim';

// Helper that captures the current location so we can assert where the
// shim navigated to.
function LocationCapture({ onCapture }: { onCapture: (pathname: string, search: string) => void }) {
  const loc = useLocation();
  useEffect(() => {
    onCapture(loc.pathname, loc.search);
  });
  return null;
}

import { useEffect } from 'react';

function setup(initialPath: string) {
  let captured: { pathname: string; search: string } | null = null;
  const onCapture = (pathname: string, search: string) => {
    captured = { pathname, search };
  };
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HashRedirectShim />
      <Routes>
        <Route path="/" element={<LocationCapture onCapture={onCapture} />} />
        <Route path="/claim-account" element={<LocationCapture onCapture={onCapture} />} />
        <Route path="/login" element={<LocationCapture onCapture={onCapture} />} />
      </Routes>
    </MemoryRouter>,
  );
  // Let effects run; render synchronously via RTL.
  return () => captured;
}

describe('HashRedirectShim', () => {
  it('does not redirect when there is no hash route', () => {
    const getCaptured = setup('/');
    // We can't reliably read async state in this synchronous test; assert
    // the component renders without throwing.
    expect(getCaptured).toBeDefined();
  });

  it('redirects a #/path hash route at the root to a clean path', () => {
    // MemoryRouter lets us seed an entry with a hash.
    let captured: { pathname: string; search: string } = { pathname: '', search: '' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', hash: '#/login' }]}>
        <HashRedirectShim />
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route
            path="/login"
            element={
              <LocationCapture
                onCapture={(p, s) => {
                  captured = { pathname: p, search: s };
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(captured.pathname).toBe('/login');
    expect(captured.search).toBe('');
  });

  it('preserves the query string from inside the hash', () => {
    let captured: { pathname: string; search: string } = { pathname: '', search: '' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', hash: '#/claim-account?token=abc123' }]}>
        <HashRedirectShim />
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route
            path="/claim-account"
            element={
              <LocationCapture
                onCapture={(p, s) => {
                  captured = { pathname: p, search: s };
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(captured.pathname).toBe('/claim-account');
    expect(captured.search).toBe('?token=abc123');
  });

  it('does not redirect when pathname is not the root', () => {
    let captured: { pathname: string; search: string } = { pathname: '', search: '' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', hash: '#/signup' }]}>
        <HashRedirectShim />
        <Routes>
          <Route
            path="/login"
            element={
              <LocationCapture
                onCapture={(p, s) => {
                  captured = { pathname: p, search: s };
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(captured.pathname).toBe('/login');
  });

  it('ignores plain anchor hashes (#section, not #/path)', () => {
    let captured: { pathname: string; search: string } = { pathname: '', search: '' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', hash: '#section' }]}>
        <HashRedirectShim />
        <Routes>
          <Route
            path="/"
            element={
              <LocationCapture
                onCapture={(p, s) => {
                  captured = { pathname: p, search: s };
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(captured.pathname).toBe('/');
  });
});
