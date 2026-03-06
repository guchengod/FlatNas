
// @vitest-environment jsdom
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MemoWidget from '../MemoWidget.vue';

// Mock IDB
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    put: vi.fn(),
    get: vi.fn(),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
    objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
    createObjectStore: vi.fn(),
    delete: vi.fn(),
  })
}));

// Mock Store
const mockStore = {
  isLogged: true,
  isConnected: true,
  getHeaders: () => ({ Authorization: 'Bearer token' }),
  socket: { connected: true, emit: vi.fn(), on: vi.fn(), off: vi.fn() }
};

vi.mock('../../stores/main', () => ({
  useMainStore: () => mockStore
}));

// Mock Config
vi.mock('../../config', () => ({
  CONFIG: {
    POLL_ACTIVE_INTERVAL: 1000,
    ACTIVE_INPUT_WINDOW: 2000,
    INPUT_COOLDOWN: 1000
  }
}));

describe('MemoWidget Conflict Reproduction', () => {
  let wrapper: VueWrapper<any>;
  let fetchMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Default fallback
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { content: '', server_ts: 0 } })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reproduces version conflict when rapid saves occur with network delay', async () => {
    wrapper = mount(MemoWidget, {
      props: {
        widget: {
          id: 'test-widget',
          type: 'memo',
          data: { simple: 'initial', server_ts: 100 },
          x: 0, y: 0, w: 1, h: 1,
          enable: true,
          isPublic: false
        }
      }
    });

    await flushPromises();
    await nextTick();

    // Prepare promises
    let resolveFirstFetch: (value: any) => void;
    const firstFetchPromise = new Promise(resolve => { resolveFirstFetch = resolve; });

    let resolveSecondFetch: (value: any) => void;
    const secondFetchPromise = new Promise(resolve => { resolveSecondFetch = resolve; });

    // Custom implementation to control responses based on call order
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      callCount++;

      if (callCount === 1) {
        return firstFetchPromise;
      }
      if (callCount === 2) {
        return secondFetchPromise;
      }

      return {
        ok: true,
        json: async () => ({ success: true, data: { content: '', server_ts: 0 } })
      };
    });

    // 1. User types "A"
    const textarea = wrapper.find('textarea');
    await textarea.trigger('focus');
    await textarea.setValue('initialA');

    // 2. Advance time to trigger auto-save (800ms debounce from watch + 800ms from saveToServer)
    await vi.advanceTimersByTimeAsync(1600);

    // Check first fetch
    expect(callCount).toBe(1);
    const firstCall = fetchMock.mock.calls[0];
    const firstBody = JSON.parse(firstCall[1].body);
    expect(firstBody.server_ts).toBe(100);
    // expect(firstBody.content).toBe('initialA'); // Might be initialAB if logic is fast, but let's check

    // 3. User types "B" (triggering pending save logic)
    await textarea.setValue('initialAB');

    // 4. Advance time again
    await vi.advanceTimersByTimeAsync(1600);

    // Should still be 1 call because first is pending
    expect(callCount).toBe(1);

    // 5. Resolve first fetch
    resolveFirstFetch!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { content: 'initialA', server_ts: 101 }
      })
    });

    await flushPromises();

    // Now pending save should trigger
    expect(callCount).toBe(2);

    const secondCall = fetchMock.mock.calls[1];
    const secondBody = JSON.parse(secondCall[1].body);
    expect(secondBody.server_ts).toBe(101); // Fix verification
    expect(secondBody.content).toBe('initialAB');

    // 6. Resolve second fetch
    resolveSecondFetch!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { content: 'initialAB', server_ts: 102 }
      })
    });

    await flushPromises();

    // 7. Verify no conflict
    const conflictMsg = wrapper.find('.text-red-600');
    expect(conflictMsg.exists()).toBe(false);
  });
});

// Helper to flush promises
const flushPromises = async () => {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(1);
  } else {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};
