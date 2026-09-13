import re
import os

filepath = 'datenschutzerklaerung.html'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Drop lines 50 to 546 (0-indexed 50 to 546)
prefix = lines[:50]
suffix = lines[547:]

raw_text = "".join(lines[87:547])

# Let's hand-craft the HTML for the raw_text based on its content since we have the full text and we know where the headers are.
# Wait, let's just make an array of strings for the HTML to be injected.
# Or better yet, we can process the raw text line by line.

html_output = []

def process_section(text):
    out = []
    lines_list = [t.strip() for t in text.split('\n')]
    
    in_list = False
    
    for l in lines_list:
        if not l:
            continue
            
        # If it's a short line without a period at the end and title-like, it's probably a h3 header
        # Example: "Arten der verarbeiteten Daten", "Kategorien betroffener Personen", "Sicherheitsmaßnahmen"
        # However, some headers have a colon at the end, or are just sentences.
        # Let's write rules.
        
        # Headers:
        if l in ["Arten der verarbeiteten Daten", "Kategorien betroffener Personen", 
                 "Zwecke der Verarbeitung", "Maßgebliche Rechtsgrundlagen", 
                 "Sicherheitsmaßnahmen", 
                 "Allgemeine Informationen zur Datenspeicherung und Löschung", 
                 "Rechte der betroffenen Personen", 
                 "Bereitstellung des Onlineangebots und Webhosting", 
                 "Einsatz von Cookies", 
                 "Registrierung, Anmeldung und Nutzerkonto", 
                 "Single-Sign-On-Anmeldung", 
                 "Änderung und Aktualisierung", 
                 "Begriffsdefinitionen"]:
            if in_list:
                out.append("            </ul>")
                in_list = False
            out.append(f"            <h3>{l}</h3>")
            continue
            
        if l == "Weitere Hinweise zu Verarbeitungsprozessen, Verfahren und Diensten:":
            if in_list:
                out.append("            </ul>")
                in_list = False
            out.append(f"            <h4>{l}</h4>")
            continue
            
        # Lists: if it ends with period, and it's short, or if it's the "Arten..." lists
        # Wait, the lists in the raw text have no bullet points, they are just lines.
        # For example: 
        # Bestandsdaten.
        # Beschäftigtendaten.
        # Kontaktdaten.
        if out and out[-1] in ["            <h3>Arten der verarbeiteten Daten</h3>", 
                               "            <h3>Kategorien betroffener Personen</h3>", 
                               "            <h3>Zwecke der Verarbeitung</h3>",
                               "            <h3>Maßgebliche Rechtsgrundlagen</h3>"]: 
            # Following are items. But wait, "Maßgebliche Rechtsgrundlagen nach der DSGVO: ..." is a paragraph
            pass

        # If it looks like an item (ends in period, no or few commas, starts with capital, length < 50):
        # We can just check manual things or wrap everything in <p>.
        
        # We can just wrap it in <p> if it's longer text. 
        # If it starts with, e.g., "Einwilligung (Art. 6 Abs. 1 S. 1 lit. a) DSGVO) -" it's a list item.
        
        # A simpler robust way:
        is_list_item = False
        if l.endswith('.') and len(l.split(' ')) <= 5: 
            is_list_item = True
        
        # Specific list items in the text:
        if l.startswith("Bestandsdaten.") or l.startswith("Beschäftigtendaten.") or l.endswith("daten.") or l.endswith("personen.") or l.endswith("Hinweisgeber."):
            is_list_item = True
            
        if l.startswith("Erbringung vertraglicher Leistungen") or \
           l.startswith("Sicherheitsmaßnahmen.") or \
           l.startswith("Organisations- und Verwaltungsverfahren.") or \
           l.startswith("Anmeldeverfahren.") or \
           l.startswith("Bereitstellung unseres Onlineangebotes") or \
           l.startswith("Informationstechnische Infrastruktur.") or \
           l.startswith("Hinweisgeberschutz."):
           is_list_item = True
           
        if " - " in l and (l.startswith("10 Jahre -") or l.startswith("8 Jahre -") or l.startswith("6 Jahre -") or l.startswith("3 Jahre -") or l.split(' ')[0] in ["Einwilligung", "Vertragserfüllung", "Rechtliche", "Berechtigte", "Temporäre", "Permanente"]):
            is_list_item = True
           
        if (l.split(':')[0] in ["Registrierung mit Pseudonymen", "Profile der Nutzer sind nicht öffentlich", "Zwei-Faktor-Authentifizierung", "Löschung von Daten nach Kündigung", "Keine Aufbewahrungspflicht für Daten", "Google Single-Sign-On", "Widerspruchsmöglichkeit (Opt-Out)", "Bereitstellung Onlineangebot auf gemietetem Speicherplatz", "Erhebung von Zugriffsdaten und Logfiles", "E-Mail-Versand und -Hosting", "Verarbeitung von Cookie-Daten auf Grundlage einer Einwilligung", "Fristbeginn mit Ablauf des Jahres", "Widerspruchsrecht", "Widerrufsrecht bei Einwilligungen", "Auskunftsrecht", "Recht auf Berichtigung", "Recht auf Löschung und Einschränkung der Verarbeitung", "Recht auf Datenübertragbarkeit", "Beschwerde bei Aufsichtsbehörde"]):
            is_list_item = True
            
        # Definitions list items
        if l.split(':')[0] in ["Beschäftigte", "Beschäftigtendaten", "Bestandsdaten", "Inhaltsdaten", "Kontaktdaten", "Meta-, Kommunikations- und Verfahrensdaten", "Nutzungsdaten", "Personenbezogene Daten", "Protokolldaten", "Verantwortlicher", "Verarbeitung"]:
            is_list_item = True

        if is_list_item:
            if not in_list:
                out.append("            <ul>")
                in_list = True
            
            # Make the first part bold if there is a colon or hyphen
            if " - " in l and (l.split(' - ')[0].endswith(')') or "Jahre" in l.split(' - ')[0]):
                parts = l.split(' - ', 1)
                out.append(f"                <li><strong>{parts[0]}</strong> - {parts[1]}</li>")
            elif ":" in l and l.split(':')[0] in ["Registrierung mit Pseudonymen", "Profile der Nutzer sind nicht öffentlich", "Zwei-Faktor-Authentifizierung", "Löschung von Daten nach Kündigung", "Keine Aufbewahrungspflicht für Daten", "Google Single-Sign-On", "Widerspruchsmöglichkeit (Opt-Out)", "Bereitstellung Onlineangebot auf gemietetem Speicherplatz", "Erhebung von Zugriffsdaten und Logfiles", "E-Mail-Versand und -Hosting", "Verarbeitung von Cookie-Daten auf Grundlage einer Einwilligung", "Fristbeginn mit Ablauf des Jahres", "Widerspruchsrecht", "Widerrufsrecht bei Einwilligungen", "Auskunftsrecht", "Recht auf Berichtigung", "Recht auf Löschung und Einschränkung der Verarbeitung", "Recht auf Datenübertragbarkeit", "Beschwerde bei Aufsichtsbehörde", "Beschäftigte", "Beschäftigtendaten", "Bestandsdaten", "Inhaltsdaten", "Kontaktdaten", "Meta-, Kommunikations- und Verfahrensdaten", "Nutzungsdaten", "Personenbezogene Daten", "Protokolldaten", "Verantwortlicher", "Verarbeitung"]:
                parts = l.split(':', 1)
                out.append(f"                <li><strong>{parts[0]}:</strong>{parts[1]}</li>")
            else:
                out.append(f"                <li>{l}</li>")
        else:
            if in_list:
                out.append("            </ul>")
                in_list = False
            out.append(f"            <p>{l}</p>")
            
    if in_list:
        out.append("            </ul>")
        
    return out

formatted = process_section(raw_text)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(prefix)
    f.write("\n".join(formatted) + "\n")
    f.writelines(suffix)
    
print("Formatted datenschutzerklaerung.html")
