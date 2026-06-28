import { T } from '../tokens'

export default function Impressum() {
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 24, marginTop: 0 }}>Impressum</h1>

      <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4, marginBottom: T.sp4 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Anbieter</h2>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Wohnbau Hess GmbH u. Co KG
          <br />
          Parkstrasse 20
          <br />
          61118 Bad Vilbel
          <br />
          Telefon:{' '}
          <a href="tel:+49610150500" style={{ color: T.primary, textDecoration: 'none' }}>
            +49 6101 50500
          </a>
          <br />
          E-Mail:{' '}
          <a href="mailto:info@wohnbau-hess.de" style={{ color: T.primary, textDecoration: 'none' }}>
            info@wohnbau-hess.de
          </a>
        </p>
      </section>

      <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Datenschutzerklaerung</h2>
        <p style={{ marginTop: 0, lineHeight: 1.5, color: T.textMuted }}>
          Diese Anwendung verarbeitet Vertrags- und Vorgangsdaten zur Verwaltung und Synchronisierung innerhalb der berechtigten Nutzerbereiche.
        </p>
        <p style={{ marginTop: 0, lineHeight: 1.5, color: T.textMuted }}>
          Es werden nur Daten verarbeitet, die fuer die Funktion der Anwendung erforderlich sind. Zugriff erhalten nur freigegebene Benutzer.
        </p>
        <p style={{ marginBottom: 0, lineHeight: 1.5, color: T.textMuted }}>
          Fuer Auskunft, Berichtigung oder Loeschung personenbezogener Daten wenden Sie sich bitte an den oben genannten Anbieter.
        </p>
      </section>
    </div>
  )
}
