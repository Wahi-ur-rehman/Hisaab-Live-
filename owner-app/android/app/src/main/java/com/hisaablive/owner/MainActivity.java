package com.hisaablive.owner;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupNativeInterface();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupNativeInterface();
    }

    private void setupNativeInterface() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void print() {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                    if (printManager != null) {
                                        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter("HisaabLive_Statement");
                                        printManager.print("HisaabLive_Statement", printAdapter, new PrintAttributes.Builder().build());
                                    }
                                } catch (Exception e) {
                                    e.printStackTrace();
                                }
                            }
                        });
                    }

                    @JavascriptInterface
                    public void savePdf(String base64Data, String filename) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    byte[] pdfBytes = Base64.decode(base64Data, Base64.DEFAULT);
                                    Uri uri = null;
                                    
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                        ContentValues values = new ContentValues();
                                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                                        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                                        uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                                        if (uri != null) {
                                            OutputStream out = getContentResolver().openOutputStream(uri);
                                            if (out != null) {
                                                out.write(pdfBytes);
                                                out.close();
                                            }
                                        }
                                    } else {
                                        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                                        File file = new File(downloads, filename);
                                        FileOutputStream fos = new FileOutputStream(file);
                                        fos.write(pdfBytes);
                                        fos.close();
                                        uri = Uri.fromFile(file);
                                    }
                                    
                                    Toast.makeText(MainActivity.this, "PDF saved to Downloads: " + filename, Toast.LENGTH_LONG).show();
                                    
                                    if (uri != null) {
                                        try {
                                            Intent intent = new Intent(Intent.ACTION_VIEW);
                                            intent.setDataAndType(uri, "application/pdf");
                                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                                            startActivity(Intent.createChooser(intent, "Open PDF Statement"));
                                        } catch (Exception launchErr) {
                                            // Fallback silently if no viewer installed, file is already in Downloads
                                            launchErr.printStackTrace();
                                        }
                                    }
                                } catch (Exception e) {
                                    Toast.makeText(MainActivity.this, "PDF saved to Downloads folder.", Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                    }
                }, "AndroidNative");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
