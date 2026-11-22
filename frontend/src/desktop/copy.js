// The words of BlackGym's desktop layer. Kept here and not in the language packs, for the reason
// lib/feedback.js gives: the layer exists in this deployment alone, so it speaks English, Russian
// and Ukrainian and falls back to English. Whatever openGym already says (Plan, Stats, History…)
// is still taken from the packs with t().
import { getLang } from '../lib/i18n.js'

const COPY = {
  en: {
    training: 'Training', progress: 'Progress', fold: 'Fold the menu', unfold: 'Open the menu',
    startToday: 'Start', records: 'Records',
    // Overview
    weekWorkouts: 'Workouts this week', weekVolume: 'Volume this week', weekSets: 'Sets this week', streak: 'Weeks in a row',
    ofPlan: '{0} of {1}', vsLast: '{0} vs last week', noCompare: 'no week to compare with yet', sameAsLast: 'same as last week',
    volumeByWeek: 'Volume by week', volumeHint: '{0} weeks · everything lifted in work sets',
    weekOf: 'week of {0}', workoutsN: 'workouts: {0}', setsN: 'sets: {0}', noTraining: 'No training in these weeks yet.',
    musclesWeek: 'Sets per muscle this week', done: 'done', range: 'target range', inRange: 'in range', below: 'below', above: 'above',
    room: 'Most room left: {0}, {1} more to reach the range.', noSetsYet: 'No sets logged this week yet.',
    setsOf: '{0} of {1}', allMuscles: 'All muscles', fewerMuscles: 'Fewer',
    todayCol: 'Today',
    // Records
    recordsSub: 'Your base lifts', pickBase: 'Choose base lifts', weightRec: 'Weight record', volumeRec: 'Volume record',
    repsRec: 'Reps record', sessionRec: 'In one workout', inOneSet: 'in one set', repsInSets: 'reps in {0} sets',
    sameSet: 'the same set', notYet: 'Not logged yet', notYetHint: 'Its records appear after the first workout with it.',
    lastTime: 'last time {0}', explainWeight: 'Weight record: the heaviest set.', explainVolume: 'Volume record: the most kilograms in one set, weight × reps.',
    ladder: 'Ladder: {0}', ladderHint: 'The best set at each weight. The bar is the kilograms moved in that set.',
    bothRec: 'weight and volume record', bodyweightNote: 'Done with body weight. Its records are counted in reps: in one set and in one workout.',
    newRecords: 'New records', recordsIn: '{0} records', recordIn: '1 record', noNewRecords: 'No records saved yet. They are marked when a workout is finished.',
    history: 'History', baseTitle: 'Base lifts', baseHint: 'These are the lifts the Records screen follows. Pick the ones that matter to you.',
    emptyBase: 'No base lifts chosen. Pick some to see their records.'
  },
  ru: {
    training: 'Тренировки', progress: 'Прогресс', fold: 'Свернуть меню', unfold: 'Развернуть меню',
    startToday: 'Старт', records: 'Рекорды',
    weekWorkouts: 'Тренировки за неделю', weekVolume: 'Объём за неделю', weekSets: 'Подходы за неделю', streak: 'Недель подряд',
    ofPlan: '{0} из {1}', vsLast: '{0} к прошлой неделе', noCompare: 'пока не с чем сравнить', sameAsLast: 'как на прошлой неделе',
    volumeByWeek: 'Объём по неделям', volumeHint: '{0} недель · всё поднятое в рабочих подходах',
    weekOf: 'неделя с {0}', workoutsN: 'тренировок: {0}', setsN: 'подходов: {0}', noTraining: 'За эти недели тренировок пока нет.',
    musclesWeek: 'Подходы по мышцам за неделю', done: 'сделано', range: 'целевой диапазон', inRange: 'в норме', below: 'ниже нормы', above: 'выше нормы',
    room: 'Больше всего не хватает: {0}, ещё {1} до нормы.', noSetsYet: 'На этой неделе подходов пока нет.',
    setsOf: '{0} из {1}', allMuscles: 'Все мышцы', fewerMuscles: 'Свернуть',
    todayCol: 'Сегодня',
    recordsSub: 'Ваши базовые упражнения', pickBase: 'Выбрать базовые', weightRec: 'Рекорд веса', volumeRec: 'Рекорд объёма',
    repsRec: 'Рекорд повторов', sessionRec: 'За одну тренировку', inOneSet: 'за один подход', repsInSets: 'повторов в {0} подходах',
    sameSet: 'тот же подход', notYet: 'Ещё не делали', notYetHint: 'Рекорды появятся после первой тренировки с ним.',
    lastTime: 'последний раз {0}', explainWeight: 'Рекорд веса: самый тяжёлый подход.', explainVolume: 'Рекорд объёма: больше всего килограммов за один подход, вес × повторы.',
    ladder: 'Лестница: {0}', ladderHint: 'Лучший подход на каждом весе. Длина полосы показывает килограммы за подход.',
    bothRec: 'рекорд веса и объёма', bodyweightNote: 'Упражнение со своим весом. Рекорды считаются в повторах: за один подход и за одну тренировку.',
    newRecords: 'Новые рекорды', recordsIn: 'рекордов: {0}', recordIn: '1 рекорд', noNewRecords: 'Рекордов пока нет. Они отмечаются, когда тренировка завершена.',
    history: 'История', baseTitle: 'Базовые упражнения', baseHint: 'За этими упражнениями следит экран «Рекорды». Отметьте те, что важны вам.',
    emptyBase: 'Базовые упражнения не выбраны. Отметьте несколько, чтобы видеть рекорды.'
  },
  uk: {
    training: 'Тренування', progress: 'Прогрес', fold: 'Згорнути меню', unfold: 'Розгорнути меню',
    startToday: 'Старт', records: 'Рекорди',
    weekWorkouts: 'Тренування за тиждень', weekVolume: 'Обсяг за тиждень', weekSets: 'Підходи за тиждень', streak: 'Тижнів поспіль',
    ofPlan: '{0} з {1}', vsLast: '{0} до минулого тижня', noCompare: 'поки немає з чим порівняти', sameAsLast: 'як минулого тижня',
    volumeByWeek: 'Обсяг за тижнями', volumeHint: '{0} тижнів · усе підняте в робочих підходах',
    weekOf: 'тиждень з {0}', workoutsN: 'тренувань: {0}', setsN: 'підходів: {0}', noTraining: 'За ці тижні тренувань поки немає.',
    musclesWeek: 'Підходи за м’язами за тиждень', done: 'зроблено', range: 'цільовий діапазон', inRange: 'у нормі', below: 'нижче норми', above: 'вище норми',
    room: 'Найбільше бракує: {0}, ще {1} до норми.', noSetsYet: 'Цього тижня підходів поки немає.',
    setsOf: '{0} з {1}', allMuscles: 'Усі м’язи', fewerMuscles: 'Згорнути',
    todayCol: 'Сьогодні',
    recordsSub: 'Ваші базові вправи', pickBase: 'Обрати базові', weightRec: 'Рекорд ваги', volumeRec: 'Рекорд обсягу',
    repsRec: 'Рекорд повторень', sessionRec: 'За одне тренування', inOneSet: 'за один підхід', repsInSets: 'повторень у {0} підходах',
    sameSet: 'той самий підхід', notYet: 'Ще не робили', notYetHint: 'Рекорди з’являться після першого тренування з нею.',
    lastTime: 'востаннє {0}', explainWeight: 'Рекорд ваги: найважчий підхід.', explainVolume: 'Рекорд обсягу: найбільше кілограмів за один підхід, вага × повторення.',
    ladder: 'Драбина: {0}', ladderHint: 'Найкращий підхід на кожній вазі. Довжина смуги показує кілограми за підхід.',
    bothRec: 'рекорд ваги та обсягу', bodyweightNote: 'Вправа з власною вагою. Рекорди рахуються в повтореннях: за один підхід і за одне тренування.',
    newRecords: 'Нові рекорди', recordsIn: 'рекордів: {0}', recordIn: '1 рекорд', noNewRecords: 'Рекордів поки немає. Вони позначаються, коли тренування завершено.',
    history: 'Історія', baseTitle: 'Базові вправи', baseHint: 'За цими вправами стежить екран «Рекорди». Позначте ті, що важливі вам.',
    emptyBase: 'Базові вправи не обрано. Позначте кілька, щоб бачити рекорди.'
  }
}

/** The words for a language code ("ru", "uk-UA"…); English where there are none. */
export const deskCopy = (lang = getLang()) => COPY[String(lang || '').toLowerCase().split(/[-_]/)[0]] || COPY.en

/** "{0} of {1}" filled in. */
export const fill = (s, ...args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : String(args[i])))

export const DESK_LANGS = Object.keys(COPY)
