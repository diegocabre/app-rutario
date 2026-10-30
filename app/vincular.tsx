import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useClientes } from "@/context/ClientesContext";
import { tokenDesdeQR } from "@/services/vinculo";

export default function Vincular() {
  const router = useRouter();
  const { vincularCon } = useClientes();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [enlace, setEnlace] = useState("");
  const [vinculando, setVinculando] = useState(false);
  // La cámara dispara onBarcodeScanned muchas veces por segundo: se procesa solo el primero
  const ocupado = useRef(false);

  const intentar = async (texto: string) => {
    if (ocupado.current) return;
    const token = tokenDesdeQR(texto);
    if (!token) {
      Alert.alert("Código no válido", "Escanea el código QR que te muestra tu empresa en el panel de Ruta DyS.");
      return;
    }
    ocupado.current = true;
    setVinculando(true);
    const error = await vincularCon(token);
    setVinculando(false);
    if (error) {
      Alert.alert("No se pudo vincular", error, [{ text: "OK", onPress: () => (ocupado.current = false) }]);
      return;
    }
    Alert.alert("¡Listo!", "Tu app quedó vinculada a tu empresa.", [{ text: "OK", onPress: () => router.back() }]);
  };

  return (
    <View style={styles.contenedor}>
      <Text style={styles.texto}>Escanea el código QR que te muestra tu empresa en el panel.</Text>

      {!permiso ? null : permiso.granted ? (
        <CameraView
          style={styles.camara}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={vinculando ? undefined : ({ data }) => intentar(data)}
        />
      ) : (
        <TouchableOpacity style={styles.boton} onPress={pedirPermiso}>
          <Text style={styles.botonTexto}>Permitir usar la cámara</Text>
        </TouchableOpacity>
      )}

      {vinculando && <ActivityIndicator size="large" />}

      <Text style={styles.ayuda}>¿No funciona la cámara? Pega aquí el enlace del código:</Text>
      <TextInput
        style={styles.input}
        value={enlace}
        onChangeText={setEnlace}
        placeholder="https://rutario.solucionesdys.cl/vincular?t=…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.boton} disabled={vinculando || !enlace} onPress={() => intentar(enlace)}>
        <Text style={styles.botonTexto}>Vincular</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  texto: { fontSize: 16, color: "#111827" },
  camara: { width: "100%", aspectRatio: 1, borderRadius: 12, overflow: "hidden" },
  ayuda: { fontSize: 13, color: "#4b5563" },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 10, fontSize: 14, color: "#111827" },
  boton: { backgroundColor: "#05694a", padding: 14, borderRadius: 8, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
