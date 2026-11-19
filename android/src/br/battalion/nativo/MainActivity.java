package br.battalion.nativo;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

// Battalion Nativo no Android: o jogo (HTML/JS) roda numa WebView e todos os arquivos vêm de assets/www.
// O endereço https://appassets.androidplatform.net/ é atendido aqui mesmo (shouldInterceptRequest), então funciona
// sem internet. Links externos (ex.: convite de multiplayer) abrem no navegador do aparelho.
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("gif", "image/gif");
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("wav", "audio/wav");
        TYPES.put("woff", "font/woff");
    }
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                String path = url.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                if (path.contains("..")) return notFound();
                try {
                    InputStream stream = getAssets().open("www" + path);
                    String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
                    String type = TYPES.containsKey(extension) ? TYPES.get(extension) : "application/octet-stream";
                    WebResourceResponse response = new WebResourceResponse(type, "utf-8", stream);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-cache");
                    response.setResponseHeaders(headers);
                    return response;
                } catch (IOException missing) {
                    return notFound();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                return true;
            }
        });
        setContentView(web);
        hideBars();
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/");
    }

    private WebResourceResponse notFound() {
        WebResourceResponse response = new WebResourceResponse("text/plain", "utf-8", null);
        response.setStatusCodeAndReasonPhrase(404, "Not Found");
        return response;
    }

    // Tela cheia de verdade (sem barra de status nem de navegação; deslizar da borda mostra de novo).
    private void hideBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    // Botão voltar: volta uma página dentro do jogo; na primeira tela, sai do app.
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
