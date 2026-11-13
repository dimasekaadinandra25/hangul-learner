// Windows helpers for the end-to-end test (compiled by win.ps1). No mouse or keyboard input is used:
// windows get WM_CLOSE, the tray icon gets the same callback message the shell sends on a click,
// and tray menu items are read from the real popup menu and chosen with WM_COMMAND, like a click would.
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class HL {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr m);
  [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr m, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuString(IntPtr m, uint id, StringBuilder s, int n, uint flags);
  public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Presses Ctrl+Alt+<vk> (the app's global shortcuts)
  public static void Hotkey(byte vk) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 0, UIntPtr.Zero);
    keybd_event(vk, 0, 2, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero);
  }

  static List<IntPtr> Windows(uint pid, string cls, string title) {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (pid != 0 && p != pid) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if ((cls == null || c.ToString() == cls) && (title == null || t.ToString() == title)) r.Add(h);
      return true;
    }, IntPtr.Zero);
    return r;
  }
  static IntPtr One(uint pid, string cls, string title) { var l = Windows(pid, cls, title); return l.Count > 0 ? l[0] : IntPtr.Zero; }

  // {"found":true,"visible":true,"rect":[l,t,r,b]}
  public static string State(uint pid, string title) {
    var h = One(pid, null, title);
    if (h == IntPtr.Zero) return "{\"found\":false}";
    RECT r; GetWindowRect(h, out r);
    return "{\"found\":true,\"visible\":" + (IsWindowVisible(h) ? "true" : "false") + ",\"rect\":[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]}";
  }
  public static bool Close(uint pid, string title) { var h = One(pid, null, title); return h != IntPtr.Zero && PostMessage(h, 0x10, IntPtr.Zero, IntPtr.Zero); }

  // The tray-icon crate's hidden window gets message 6002 with the mouse message in lParam.
  const uint WM_USER_TRAYICON = 6002;
  public static bool TrayClick(uint pid, uint mouseMsg) {
    var h = One(pid, "tray_icon_app", null);
    return h != IntPtr.Zero && PostMessage(h, WM_USER_TRAYICON, IntPtr.Zero, (IntPtr)mouseMsg);
  }

  // Right-clicks the tray icon, reads the popup menu that opens (id + text per item), then closes it with Esc.
  public static string TrayMenu(uint pid) {
    // a busy desktop can swallow the first right-click: close leftovers, then try up to 3 times
    IntPtr menuWnd = IntPtr.Zero, tray = One(pid, "tray_icon_app", null);
    if (tray == IntPtr.Zero) return "{\"error\":\"no tray window\"}";
    for (int attempt = 0; attempt < 3 && menuWnd == IntPtr.Zero; attempt++) {
      foreach (var w in Windows(pid, "#32768", null)) if (IsWindowVisible(w)) { PostMessage(w, 0x100, (IntPtr)0x1B, IntPtr.Zero); PostMessage(w, 0x101, (IntPtr)0x1B, IntPtr.Zero); }
      PostMessage(tray, 0x1F, IntPtr.Zero, IntPtr.Zero);                     // WM_CANCELMODE
      System.Threading.Thread.Sleep(300);
      TrayClick(pid, 0x205);                                                  // WM_RBUTTONUP
      for (int i = 0; i < 25 && menuWnd == IntPtr.Zero; i++) {
        System.Threading.Thread.Sleep(100);
        foreach (var w in Windows(pid, "#32768", null)) if (IsWindowVisible(w)) menuWnd = w;
      }
    }
    if (menuWnd == IntPtr.Zero) return "{\"error\":\"menu did not open\"}";
    var hmenu = SendMessage(menuWnd, 0x01E1, IntPtr.Zero, IntPtr.Zero);       // MN_GETHMENU
    var sb = new StringBuilder("{\"items\":[");
    int n = GetMenuItemCount(hmenu);
    for (int i = 0; i < n; i++) {
      var t = new StringBuilder(256); GetMenuString(hmenu, (uint)i, t, 256, 0x400); // MF_BYPOSITION
      if (i > 0) sb.Append(',');
      sb.Append("{\"id\":" + GetMenuItemID(hmenu, i) + ",\"text\":\"" + t.ToString().Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
    }
    sb.Append("]}");
    PostMessage(menuWnd, 0x100, (IntPtr)0x1B, IntPtr.Zero);                    // Esc closes the menu
    PostMessage(menuWnd, 0x101, (IntPtr)0x1B, IntPtr.Zero);
    for (int i = 0; i < 20; i++) { System.Threading.Thread.Sleep(100); bool open = false; foreach (var w in Windows(pid, "#32768", null)) if (IsWindowVisible(w)) open = true; if (!open) break; }
    return sb.ToString();
  }
  public static bool TrayCommand(uint pid, uint id) {
    var h = One(pid, "tray_icon_app", null);
    return h != IntPtr.Zero && PostMessage(h, 0x111, (IntPtr)id, IntPtr.Zero);   // WM_COMMAND, as a menu click sends
  }
}
