# games
@image test_camp
@anim fog
Выбери мини-игру.
* tuner -> g_tuner
* darkness -> g_more1
* cipher / reel / solder -> g_more2
* morse / hold / выход -> g_more3

# g_more1
* darkness фонарик -> g_dark_l
* darkness спички -> g_dark_m
* darkness без света -> g_dark_n
* назад -> games

# g_more2
* cipher -> g_cipher
* reel old -> g_reel_o
* reel last -> g_reel_l
* solder -> g_solder

# g_more3
@key
* morse с фонариком -> g_morse_l
* morse без света -> g_morse_n
* hold -> g_hold
* домой -> home

# g_tuner
@game tuner target=7 -> ok:g_ok, fail:g_fail
# g_dark_l
@game darkness light=lamp -> ok:g_ok, fail:g_fail
# g_dark_m
@game darkness light=match -> ok:g_ok, fail:g_fail
# g_dark_n
@game darkness light=none compass=1 -> ok:g_ok, fail:g_fail
# g_cipher
@game cipher -> ok:g_ok, fail:g_fail
# g_reel_o
@game reel mode=old -> ok:g_ok, fail:g_fail
# g_reel_l
@game reel mode=last -> ok:g_ok, fail:g_fail
# g_solder
@game solder -> ok:g_ok, fail:g_fail
# g_morse_l
@game morse light=1 -> ok:g_ok, fail:g_fail
# g_morse_n
@game morse light=0 -> ok:g_ok, fail:g_fail
# g_hold
@game hold kurgod=1 -> ok:g_ok, fail:g_fail

# g_ok
Исход: ok.
-> games
# g_fail
Исход: fail.
-> games
