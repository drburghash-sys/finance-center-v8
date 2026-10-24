package com.drburghash.financecenter.v8;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
public class MainActivity extends Activity {
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private static final int FILE_REQUEST=1201;
 @Override public void onCreate(Bundle b){super.onCreate(b);
 web=new WebView(this);setContentView(web);
 web.getSettings().setJavaScriptEnabled(true);
 web.getSettings().setDomStorageEnabled(true);
 web.getSettings().setAllowFileAccess(true);
 web.getSettings().setAllowContentAccess(true);
 web.setWebViewClient(new WebViewClient());
 web.setWebChromeClient(new WebChromeClient(){
 @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
 if(fileCallback!=null)fileCallback.onReceiveValue(null);
 fileCallback=callback;
 try { startActivityForResult(params.createIntent(),FILE_REQUEST);return true; }
 catch(Exception e){fileCallback=null;return false;}
 }});
 web.loadUrl("file:///android_asset/index.html");
 }
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==FILE_REQUEST&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}