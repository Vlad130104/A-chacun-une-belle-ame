import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Coquille de l'application membre (phase C).
 * Les écrans du parcours arrivent avec les tranches D1 à D5 : les jetons de conception
 * ci-dessous sont volontairement identiques à ceux du web (docs/07-parcours-ux.md §1).
 */
export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.titre}>À Chacun Une Belle Âme</Text>
      <Text style={styles.texte}>
        Rencontres sérieuses, membres vérifiés, messagerie ouverte uniquement après accord mutuel.
      </Text>
      <Text style={styles.mention}>
        Service réservé aux personnes majeures. Vérification d’identité obligatoire.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  titre: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1917',
    textAlign: 'center',
    marginBottom: 12,
  },
  texte: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1C1917',
    textAlign: 'center',
    marginBottom: 24,
  },
  mention: {
    fontSize: 13,
    color: '#57534E',
    textAlign: 'center',
  },
});
