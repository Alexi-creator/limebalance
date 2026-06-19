// Registry of supported bot languages. Mirrors the set used by the web cabinet
// so the two stay in sync. Each entry pairs a human label with its translation
// bundle (loaded from ./locales/*.json).

import ar from './locales/ar.json';
import bg from './locales/bg.json';
import cs from './locales/cs.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import et from './locales/et.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import he from './locales/he.json';
import hr from './locales/hr.json';
import hu from './locales/hu.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import nb from './locales/nb.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sk from './locales/sk.json';
import sl from './locales/sl.json';
import sv from './locales/sv.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

interface LangConfig {
  label: string;
  translation: Record<string, unknown>;
}

export const languages = {
  en: { label: 'English', translation: en },
  ru: { label: 'Русский', translation: ru },
  de: { label: 'Deutsch', translation: de },
  fr: { label: 'Français', translation: fr },
  es: { label: 'Español', translation: es },
  it: { label: 'Italiano', translation: it },
  pt: { label: 'Português', translation: pt },
  nl: { label: 'Nederlands', translation: nl },
  sv: { label: 'Svenska', translation: sv },
  nb: { label: 'Norsk', translation: nb },
  da: { label: 'Dansk', translation: da },
  fi: { label: 'Suomi', translation: fi },
  et: { label: 'Eesti', translation: et },
  el: { label: 'Ελληνικά', translation: el },
  hu: { label: 'Magyar', translation: hu },
  tr: { label: 'Türkçe', translation: tr },
  bg: { label: 'Български', translation: bg },
  pl: { label: 'Polski', translation: pl },
  cs: { label: 'Čeština', translation: cs },
  sk: { label: 'Slovenčina', translation: sk },
  uk: { label: 'Українська', translation: uk },
  ro: { label: 'Română', translation: ro },
  hr: { label: 'Hrvatski', translation: hr },
  lt: { label: 'Lietuvių', translation: lt },
  sl: { label: 'Slovenščina', translation: sl },
  lv: { label: 'Latviešu', translation: lv },
  he: { label: 'עברית', translation: he },
  ar: { label: 'العربية', translation: ar },
  ja: { label: '日本語', translation: ja },
  zh: { label: '中文', translation: zh },
  ko: { label: '한국어', translation: ko },
  id: { label: 'Bahasa Indonesia', translation: id },
  th: { label: 'ไทย', translation: th },
  vi: { label: 'Tiếng Việt', translation: vi },
} satisfies Record<string, LangConfig>;

export type Locale = keyof typeof languages;

export const SUPPORTED_LOCALES = Object.keys(languages) as Locale[];
