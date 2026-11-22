package com.progression.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String URL = "file:///android_asset/index.html";
    private static final int REQ_FILE = 1, REQ_SAVE = 2;

    // Rend l'export (blob + <a download>) et l'impression utilisables dans une WebView.
    private static final String SHIM =
        "(function(){if(window.__apkShim)return;window.__apkShim=1;"
      + "var B=window.AndroidBridge;if(!B)return;"
      + "var oc=HTMLAnchorElement.prototype.click;"
      + "HTMLAnchorElement.prototype.click=function(){"
      +   "var a=this;if(a.download&&/^blob:/.test(a.href)){"
      +     "fetch(a.href).then(function(r){return r.blob()}).then(function(b){"
      +       "var f=new FileReader();f.onload=function(){"
      +         "B.saveFile(a.download,b.type||'application/octet-stream',String(f.result).split(',')[1]||'')};"
      +       "f.readAsDataURL(b)});return}"
      +   "return oc.call(a)};"
      + "window.print=function(){B.print()};"
      + "try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(t){B.copy(String(t));return Promise.resolve()}}})}catch(e){}"
      + "})();";

    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private byte[] pendingBytes;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String u) { v.evaluateJavascript(SHIM, null); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String u) {
                if (u.startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception e) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(Intent.createChooser(i, "Choisir un fichier"), REQ_FILE); }
                catch (ActivityNotFoundException e) { fileCb = null; return false; }
                return true;
            }
        });
        if (b != null) web.restoreState(b); else web.loadUrl(URL);
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

    @Override
    protected void onActivityResult(int req, int res, Intent d) {
        if (req == REQ_FILE) {
            if (fileCb == null) return;
            Uri[] r = null;
            if (res == RESULT_OK && d != null) {
                if (d.getClipData() != null) {
                    ClipData c = d.getClipData();
                    r = new Uri[c.getItemCount()];
                    for (int i = 0; i < r.length; i++) r[i] = c.getItemAt(i).getUri();
                } else if (d.getData() != null) r = new Uri[]{d.getData()};
            }
            fileCb.onReceiveValue(r);
            fileCb = null;
        } else if (req == REQ_SAVE) {
            if (res == RESULT_OK && d != null && d.getData() != null && pendingBytes != null) {
                try {
                    OutputStream o = getContentResolver().openOutputStream(d.getData());
                    o.write(pendingBytes); o.close();
                    Toast.makeText(this, "Fichier enregistré", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Enregistrement impossible", Toast.LENGTH_LONG).show();
                }
            }
            pendingBytes = null;
        }
    }

    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if (k == KeyEvent.KEYCODE_BACK && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(k, e);
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    private class Bridge {
        @JavascriptInterface public void saveFile(final String name, final String mime, final String b64) {
            runOnUiThread(new Runnable() { public void run() {
                try {
                    pendingBytes = Base64.decode(b64, Base64.DEFAULT);
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Export impossible", Toast.LENGTH_LONG).show();
                }
            }});
        }
        @JavascriptInterface public void print() {
            runOnUiThread(new Runnable() { public void run() {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                pm.print("Progression", web.createPrintDocumentAdapter("Progression"), new PrintAttributes.Builder().build());
            }});
        }
        @JavascriptInterface public void copy(final String t) {
            runOnUiThread(new Runnable() { public void run() {
                ((ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Progression", t));
            }});
        }
    }
}
