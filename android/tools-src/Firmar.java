import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/* Firma un APK con esquema v2 usando apksig (Maven Central).
   Uso: java Firmar <keystore.p12> <clave> <alias> <entrada.apk> <salida.apk> */
public class Firmar {
    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[0])) { ks.load(in, a[1].toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(a[2], a[1].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[2]);
        ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder(
                "CERT", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(cfg))
                .setInputApk(new File(a[3]))
                .setOutputApk(new File(a[4]))
                .setV1SigningEnabled(false) // v1 solo hace falta antes de Android 7 (minSdk 24)
                .setV2SigningEnabled(true)
                .build()
                .sign();
        System.out.println("Firmado: " + a[4]);
    }
}
