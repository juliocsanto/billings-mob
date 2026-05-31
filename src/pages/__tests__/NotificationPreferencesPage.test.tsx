// @vitest-environment jsdom
/**
 * Unit tests — NotificationPreferencesPage component
 *
 * Covers:
 *  - PermissionBanner: unsupported state
 *  - PermissionBanner: denied state
 *  - PermissionBanner: granted state
 *  - PermissionBanner: default state (shows "Ativar notificações" button)
 *  - Toggle: checked state renders correctly (aria-checked=true)
 *  - Toggle: unchecked state renders correctly (aria-checked=false)
 *  - Toggle: disabled when loading=true
 *  - Toggle: disabled when permission=denied
 *  - Time picker: shown when daily_reminder_enabled = true
 *  - Time picker: hidden when daily_reminder_enabled = false
 *  - Error banner: shown when error is non-null
 *  - handleRequestPermission: calls requestPermission from hook
 *  - handleToggle: calls updatePreferences with field and value
 *  - handleTimeChange: calls updatePreferences with daily_reminder_time
 *
 * LGPD: component never displays clinical cycle data.
 * Clinical constraint: no fertile/infertile language.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ── Mock usePushNotifications ─────────────────────────────────────────────────
const mockRequestPermission = vi.fn().mockResolvedValue(undefined);
const mockUpdatePreferences = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}));

import { usePushNotifications } from '../../hooks/usePushNotifications';
import { NotificationPreferencesPage } from '../NotificationPreferencesPage';
import type { PushPreferences } from '../../hooks/usePushNotifications';

// ── Default preferences fixture ───────────────────────────────────────────────
const DEFAULT_PREFS: PushPreferences = {
  user_id: 'user-123',
  daily_reminder_enabled: false,
  daily_reminder_time: '21:00',
  apex_alert_enabled: true,
  conflict_alert_enabled: true,
  whatsapp_enabled: false,
  fcm_token: null,
};

function defaultHookReturn(overrides: Partial<ReturnType<typeof usePushNotifications>> = {}) {
  return {
    permission: 'default' as const,
    fcmToken: null,
    preferences: DEFAULT_PREFS,
    loading: false,
    error: null,
    requestPermission: mockRequestPermission,
    updatePreferences: mockUpdatePreferences,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePushNotifications).mockReturnValue(defaultHookReturn());
});

afterEach(() => {
  cleanup();
});

// ── PermissionBanner states ───────────────────────────────────────────────────

describe('PermissionBanner — unsupported', () => {
  it('shows browser incompatibility message', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'unsupported' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toMatch(/navegador não suporta/i);
  });

  it('does NOT show "Ativar notificações" button', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'unsupported' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const btns = Array.from(container.querySelectorAll('button'));
    const ativarBtn = btns.find(b => b.textContent?.toLowerCase().includes('ativar notificações'));
    expect(ativarBtn).toBeUndefined();
  });
});

describe('PermissionBanner — denied', () => {
  it('shows "Notificações bloqueadas" message', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'denied' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toMatch(/notificações bloqueadas/i);
  });

  it('shows browser settings instruction text', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'denied' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toMatch(/configurações do seu navegador/i);
  });
});

describe('PermissionBanner — granted', () => {
  it('shows "Notificações push ativadas" message', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'granted' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toMatch(/notificações push ativadas/i);
  });

  it('does NOT show "Ativar notificações" button', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'granted' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const btns = Array.from(container.querySelectorAll('button'));
    const ativarBtn = btns.find(b => b.textContent?.toLowerCase().includes('ativar notificações'));
    expect(ativarBtn).toBeUndefined();
  });
});

describe('PermissionBanner — default', () => {
  it('shows "Ativar notificações" button', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'default' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const btns = Array.from(container.querySelectorAll('button'));
    const ativarBtn = btns.find(b => b.textContent?.toLowerCase().includes('ativar notificações'));
    expect(ativarBtn).toBeDefined();
  });

  it('calls requestPermission when "Ativar notificações" is clicked', async () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'default' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const btns = Array.from(container.querySelectorAll('button'));
    const ativarBtn = btns.find(b => b.textContent?.toLowerCase().includes('ativar notificações'));
    expect(ativarBtn).toBeDefined();
    fireEvent.click(ativarBtn!);
    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledOnce();
    });
  });

  it('shows "Ativando..." label while loading is in progress', () => {
    // Simulate in-flight requestPermission (requestingPermission=true)
    // We test by checking the button shows "Ativando..." when loading is truthy
    // The component uses local requestingPermission state while awaiting
    // — we simulate by making requestPermission hang
    mockRequestPermission.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'default' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const btns = Array.from(container.querySelectorAll('button'));
    const ativarBtn = btns.find(b => b.textContent?.toLowerCase().includes('ativar notificações'));
    expect(ativarBtn).toBeDefined();

    fireEvent.click(ativarBtn!);

    // After click, component sets requestingPermission=true, button text changes
    const btns2 = Array.from(container.querySelectorAll('button'));
    const ativandoBtn = btns2.find(b => b.textContent?.toLowerCase().includes('ativando'));
    expect(ativandoBtn).toBeDefined();
  });
});

// ── Toggle component ──────────────────────────────────────────────────────────

describe('Toggle — checked/unchecked rendering', () => {
  it('renders daily reminder toggle as unchecked when daily_reminder_enabled=false', () => {
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    // First switch is "Lembrete diário"
    expect(switches[0].getAttribute('aria-checked')).toBe('false');
  });

  it('renders daily reminder toggle as checked when daily_reminder_enabled=true', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({
        preferences: { ...DEFAULT_PREFS, daily_reminder_enabled: true },
      }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches[0].getAttribute('aria-checked')).toBe('true');
  });

  it('disables all toggles when loading=true', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ loading: true }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    switches.forEach(sw => {
      expect((sw as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('disables all toggles when permission="denied"', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'denied' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    switches.forEach(sw => {
      expect((sw as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('disables all toggles when permission="unsupported"', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ permission: 'unsupported' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    switches.forEach(sw => {
      expect((sw as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('calls updatePreferences with daily_reminder_enabled=true when daily toggle is clicked', async () => {
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[0]);
    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ daily_reminder_enabled: true });
    });
  });

  it('renders apex_alert toggle as checked by default (apex_alert_enabled=true)', () => {
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    // Second switch is "Novos comentários" (apex_alert)
    expect(switches[1].getAttribute('aria-checked')).toBe('true');
  });

  it('calls updatePreferences when apex_alert toggle is clicked', async () => {
    const { container } = render(<NotificationPreferencesPage />);
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[1]);
    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ apex_alert_enabled: false });
    });
  });
});

// ── Time picker ────────────────────────────────────────────────────────────────

describe('Time picker visibility', () => {
  it('is NOT shown when daily_reminder_enabled=false', () => {
    const { container } = render(<NotificationPreferencesPage />);
    const timePicker = container.querySelector('input[type="time"]');
    expect(timePicker).toBeNull();
  });

  it('IS shown when daily_reminder_enabled=true', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({
        preferences: { ...DEFAULT_PREFS, daily_reminder_enabled: true },
      }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const timePicker = container.querySelector('input[type="time"]');
    expect(timePicker).not.toBeNull();
  });

  it('calls updatePreferences with daily_reminder_time when time changes', async () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({
        preferences: { ...DEFAULT_PREFS, daily_reminder_enabled: true },
      }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    const timePicker = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(timePicker).not.toBeNull();
    fireEvent.change(timePicker, { target: { value: '08:00' } });
    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ daily_reminder_time: '08:00' });
    });
  });
});

// ── Error banner ───────────────────────────────────────────────────────────────

describe('Error banner', () => {
  it('shows error message when error is non-null', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ error: 'Erro ao carregar preferências.' }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toContain('Erro ao carregar preferências.');
  });

  it('does NOT show error banner when error is null', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ error: null }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    // No error text from the hook
    expect(container.textContent).not.toContain('Erro ao carregar preferências.');
  });
});

// ── Renders with null preferences ─────────────────────────────────────────────

describe('Null preferences graceful rendering', () => {
  it('renders without crashing when preferences is null', () => {
    vi.mocked(usePushNotifications).mockReturnValue(
      defaultHookReturn({ preferences: null }),
    );
    const { container } = render(<NotificationPreferencesPage />);
    // Page still renders with header
    expect(container.textContent).toMatch(/notificações/i);
  });
});

// ── Clinical constraint ────────────────────────────────────────────────────────

describe('Clinical constraint — no fertility language', () => {
  it('never renders fertile/infertile labels', () => {
    vi.mocked(usePushNotifications).mockReturnValue(defaultHookReturn());
    const { container } = render(<NotificationPreferencesPage />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/fértil|fertil|infértil|infertil/i);
  });

  it('privacy notice states notifications contain no clinical cycle data', () => {
    vi.mocked(usePushNotifications).mockReturnValue(defaultHookReturn());
    const { container } = render(<NotificationPreferencesPage />);
    expect(container.textContent).toMatch(/dados clínicos do seu ciclo/i);
  });
});
