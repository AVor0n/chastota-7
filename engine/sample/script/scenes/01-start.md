# intro
@chapter 1 Проба
@image test_fire
@anim fire at=41%,79% ; water below=70% ; stars
@music night_1
@amb lake
@radio 0.2
Это заглушка. Здесь [был|была] бы первая строка.
Тим (не поднимая головы): Ещё минуту.
Ася: Ты это говоришь третий час.
> Пора бы спать.
_Приёмник щёлкает._
* "Дай покрутить." {tim_trust -= 1} -> tune
* Подбросить веток -> wood
* [need asya_trust >= 1] Шепнуть Асе -> asya

# wood
~ wood += 1
Ты [подбросил|подбросила] ветку.
@if wood >= 2
Огонь гудит.
@elif wood == 1
Огонь оживает.
@else
Ничего.
@end
-> camp

# tune
@game tuner target=7 -> ok:tune_ok, fail:camp
# tune_ok
~ heard_voice = true
Голос: Не приходите.
@sfx click
~ take radio
-> camp

# asya
-> camp

# camp
@image test_camp slow
@pan left
Утро.
~ take flashlight
~ take matches
* [once] Осмотреть палатку {take knife; wood += 1} -> camp
* [if has(radio)] Включить приёмник -> radio_on
* [if ending(odd)] Вспомнить прошлое {wood += 6} -> replay
* Мини-игры -> games

# radio_on
@doc letter_1
@timer 4 -> home
* Слушать -> odd_end
* Выключить -> home

# replay
Ты уже [видел|видела] это.
* Исчезнуть -> gone_end
* Домой -> home

# home
@black
@silence
[if has(knife)] Нож оттягивает карман.
@ending calm

# odd_end
@toast Тим это запомнит.
@ending odd

# gone_end
@ending gone
