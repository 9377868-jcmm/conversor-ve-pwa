package ve.monedas.conversor;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/* Envuelve la PWA (copiada en assets/www) en un WebView: toda la interfaz,
   el cálculo y el historial funcionan sin internet; solo la consulta de
   tasas nuevas usa la red. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1115);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: tasas e historial
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        // Permite que la página local (file://) consulte las APIs de tasas.
        s.setAllowUniversalAccessFromFileURLs(true);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient()); // alert() y confirm()
        setContentView(web);

        if (estado == null || web.restoreState(estado) == null) {
            web.loadUrl("file:///android_asset/www/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume(); // dispara "visibilitychange": revisa la actualización diaria
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
