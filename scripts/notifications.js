import { $ } from './helpers.js';

const AUDIO_CUE_SOURCES = {
  success:
    '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',
  warn:
    'UklGRmzWAABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YbjWAAAAAAAADgAfAD4AUACJALgA0gEEATQBsgHgAeIB7'
    + 'QH4AeIB0QGfAXYBlQG9AREBHQJ7AokCqgLBAqECrQLMAsoC3AKUAaUBKgA8AB8AHwA6AEsATgA5ADUAMwArACAAIwApADMAL'
    + 'gAqACgAJgAcABYAFgAaABsAFAAPAAwACAAIAAUAAwABAAAAAQACAAUAAgACAAIABAAEAAUABgALAAwADAAHAAoACAAHAAgAB'
    + 'AAEAAQAAwADAAQABAADAAIAAQAAAP4A/gD9AP0A+QD4APgA9gD2AP0A/AD+AP8A/wD/AP0A/QD7APsA/AD/AAEAAwACAAIAAw'
    + 'AFAAcABQALAA8ADQARABQAHgAiACgALAAxADMALAAqACwALAAuAC0ALQArACcAJwAmACYAKAAuADcAPAA+AEUASwBOAE8ATg'
    + 'BQAFYAXwBqAHcAgwCWAJkAnQCsALMAtAC2ALkAvQDAAMEAwQDBAL8AvADKAM8A0gDXANsA2gDaANsA3ADeAOIA6QDuAPAA8gD'
    + 'xAO8A6QDaAMAAoQB5AGIAPAAxABMA+v7u/tX+xv6v/oX+gP59/mf+Rf4+/jD+L/4r/h/+Gf4U/hH+Cv4A/vf99v33/fL96/31'
    + '/fH98f3+/gD+Cv4O/hL+Gv4f/iv+LP4u/jD+MP4w/jH+M/46/kn+Tv5S/lb+Xv5p/nz+gv6P/qX+t/7G/s/++P6A/tsAOQBm'
    + 'AKcAzwDXANcA2gDfAOcA7wD2AP4A/wD7APUA9QD0APIA7gDpAOYA3gDUAMsAqgCZAIYAcwBmAFgARgA4AC4AHQAEAPb98f3f'
    + '/c390f28/bv9sP2m/aL9pf2s/av9wP3S/d/9+f4f/kn+W/5y/o/+sv7E/u/+Bf8f/zr/YwAoAGsAuwDXAO4A+wD/APEAswBm'
    + 'ABUAAf7x/e392f3J/bb9qP2m/af9sP21/b79xv3i/f7+Df5B/m3+mv7O/tT+7f4X/xv/Mv88/zn/Iv8q/z7/Wf9x/5j/4P8S'
    + '/0H/Z//X/9j/3f/d/9z/0/++/pj+cf5O/jP+H/7+/eT9zf27/bL9qv2s/b39y/3n/e/9E/4j/kX+if7D/v7+C/9P/5H/7/8N'
    + '/2X/n/8J/zT/cv/j/xj/O/9x/9z/8f/1/wkAAgAKAAsABwABAP7//v/+/gH+Af4F/gD+6/3O/bT9oP2Y/ZT9kf2U/Z/9rP3C'
    + '/dn9+v4G/gL+/f3q/eT96/36/fv9/P0D/gX+BP4C/gD++/3y/fT98f3x/fr99P0C/gj+E/4l/jn+Sv5p/n/+pP6y/sH+zv7i'
    + '/wP/I/9V/3T/d/9k/1X/Rv9B/z//Qf9Y/3L/gP+m/8X/6f8PAAYADgAWAB4AJgA3AEMATwBdAG0AfQCTAJAAlwCiAKwAvwDN'
    + 'AOEA7wD6APkA6wDYAMgAqACcAI4AgABuAGAAUABGADkAJgAfABwAGQAWABEACQAGAAUACAAIAAkABwAFAAIAAQD/AP7+/f3y'
    + '/ev98P39/f3+/gD+AP4A/gD9AP0A/gD+AP8AAQAEAAcADgAQABEAFAAqADkAQwBPAFoAYQBjAGgAdwCMAJkAqAC1AL4AxwDL'
    + 'ANUA2wDeAOcA6wDxAPcA9gD4APgA9gD1APMA9AD4AP0A/wD+AP4A/gD+AP4A/gD/AP4A/QD9AP0A/QD9AP0A/gD/AP4A/wD9'
    + 'AP0A/QD+AP8A/wD/AP4A/QD9AP0A/gD+/wD+AP0A/QD8APoA8ADjANUAxgC/AKUAmQCFAGsAWwBHAD0AKwAgAB4AJwAwADsA'
    + 'QABCAEoATQBVAFwAXgBhAGIAYwBjAGUAZgBjAGAAWgBRAFQAUAByAKIA2QDoAOgA2QClAIUAXQBJADYAKAAWAAUA/v/9/fv9'
    + '9/32/ff9/v0A/gH+AP4A/wD/AP0A/QD8APsA+gD5APkA+gD6APwA/QD9APwA/AADAAkAFQAdACcANQA7ADwAPgBBAEUASgBQA'
    + 'FUAWgBmAIwAwwDrAPoA/QD9APoA6wDWAMwAqACZAIYAdABmAFoATABDAEEAPwA8ADsAQgBKAFMAYwB0AJQAtwDxAP0A/gD8'
    + 'APEA0wClAHgAUQA+ACYAFQADAP7//v/8/fj97v3v/fT9+P38/fn9+v36/fr9+/38/fv9+/37/fv9+/36/fj98f3s/dn90/3P'
    + '/df93v3g/d/93v3i/el97/35/QH+CP4T/i3+Pf5V/nP+of63/vX+IP9F/13/a/9+/6P/zP/b/+7/BwAOABYAHgAkADEAPwBQ'
    + 'AF4AZwB2AIgAlACbAKIArACuALcAxgDNANQA1gDZANkA2QDZAOkA8wD1APIA7wDuAO8A8gD2APsA/QD9AP4A/gD+AP4A/gD+'
    + 'AP4A/gD+AP4A/gD+AP4A/gD+AP4A/QD9APsA+gD4APgA+QD5APgA+AD4APgA+AD4APgA9wD2APYA9gD2APYA9gD1APQA9AD0'
    + 'APQA9AD1APUA9QD1APUA9QD1APQA9AD0APQA9QD2APgA+gD9AP8A/gD7APYA7gDfAMwAqwChAJIAgABxAGQAXABPAEwASgBH'
    + 'AEEAOQA0ACgAIQAjAC4ARABZAGgAfQCVAKkAsgDEAM8A3wDwAPIA9wD8AP4A/wD9APsA+gD4APgA+QD6APsA/QD/AP8A/wD+'
    + 'AP0A/AACAAcACwAOAAwABgACAP8A/gD9AP0A/QD8APsA+QD4APgA+AD4APgA+QD5APoA+wD8AP0A/QD9AP4A/wD+/wD9APoA'
    + '8ADjANoA0gDbAOsA9AD/APgA5gDVAM8AzgDcAPYA/wD/AAIAAAAAAwAGAAsADgAOAA4AEAAQABAAEgAQAA4ACgAFAAQAAAD+'
    + '/f7+AP4A/QD9AP0A/QD8APwA/QD/AP4A/gD/AP8A/gD+AP4A/QD9AP4A/wD+AP0A+wD4APIA6QDZANEAxACzALUAvgDBAMIA'
    + 'xADIAN0A9QD9AP4A/QD7APgA9QDxAO4A6ADgAN0A2QDXANAAuQCgAI8AggB4AHEAbgBpAGgAZwBnAGcAZgBiAF4AVQBQAFMA'
    + 'WABlAGsAagBrAG0AcQB0AIMAmACqAL4A0gDmAPkA+gD6APsA/QD9APwA+wD6APkA+AD4APgA+AD4APgA+AD4APcA9gD1APQA'
    + '9AD0APQA9AD0APQA9AD0APQA9AD0APUA9gD3APkA+wD+AP8A/QD6APMA7gDkAN8A2wDUAM0AyADFAL8AtgCpAKMAkgB8AGgA'
    + 'VwBKAD0AOAAsACEAIAAjACkAMQA9AEwAWgBcAF4AYgBhAF4AXgBqAIAAlgCoAMMA2ADhAO4A8QDzAPEA7wDsAO4A9gD9AP4A'
    + '/gD9APsA+QD4APgA+QD6APsA/QD8APsA+QD5APgA+QD6APoA+QD4APcA9gD2APcA+QD7AP8AAgALABcAHAAkACoALAAsACkA'
    + 'JgAjACEAIAAnADEAOABAAEoAVABfAGkAfgCZALUA4AD/APwA6gDdANQAzgDIAMMAwAC7ALkAuwDGAPcA/wD+APwA9gDuANYA'
    + 'zwDLAMoAywDNANEA1QDbAOIA7gDwAPIA9AD0APcA9wD2APYA9gD1APQA9AD0APQA8wDwAO4A5wDgAPUA/wD9APoA8wDmAN8A'
    + '1gDLAMYAxgDIAOAA9gD+/wD9APcA7gDnAOQA4QDjAOwA9QD/AP8A/wAAAP8A/gD8APoA+QD4APgA+QD7AP0A/QD8APsA+QD5'
    + 'APgA9wD1APQA9AD0APQA9ADzAPEA7wDuAPMA9wD/AP8ABAAHAAUAAAD+AP4A/QD7APgA9wD1APQA9ADyAPAA8ADyAPQA9wD7'
    + '/wD/AAEABAAIAA0AFAAbAB8AJgAvADEAMAAuACgAJAAiACQAJgAmACQAIgAhAB0AHAAfACAAIAAhACEAIAAdABoAFQANAAkA'
    + 'BgAFAAYABgAHAAoACwANAA0ADAAMAAwADAALAAoACAAIAAYABQAEAAIAAQD/Af8B/wD/APwA+QD3AO4A2QDUAMcAsgCqAJ8A'
    + 'kgCBAHEAZgBVAEAAOwA0ACsAJwAjACEAIAAQAAYAAQD/AP8A/wD+APwA+QD4APgA+AD4APgA+AD5APoA+wD9AP4A/gD+AP4A'
    + '/gD+AP4A/QD9APwA/AD8APsA+QD4APcA9QDyAO8A7ADrAOoA5QDgAOAA5wDkAN4A2ADPAK8AmgCGAGsAXABSAEYAOwAyACY'
    + 'AGAAOAAEAAQACAAIABgAFAAUABgAGAAcACgAMAA8AEwAYACAAJAAqADEANgA7ADwAPQA9ADwAOgA2AC4AJAAfABwAGAAVABM'
    + 'AEQAQAA4ADAAJAAUABAADAAIAAQAAAD+AP0A/QD9AP0A/QD7APsA+gD5APgA9wD1APQA9ADzAPEA8ADtAOoA5ADdANcAyQDB'
    + 'ALgAqACWAJAAfQB0AGkAZABbAFMASABBAEUATQBSAFIATQBJAEYASQBWAF4AbAB9AJ0AuADHAM0A0wDmAPYA/gD/AP8ABAAK'
    + 'AA8AFgAiADAARQBWAGkAfgCWAKIAuwDIAN8A8QD4AP8AAwAHAA8AFAAXABkAGQAZABkAGAAWABYAFgAXABsAIwAqADMAPgBq'
    + 'AJ0AxgDeAPUA+wD8APwA+gD2AOsA2QDLALMAzADhAPcA/wD+/wD7APsA/AD/AAEABAAIAAwADgAPAA4ADAAJAAYAAwADAAMA'
    + 'BAAEAAQABAADAAMAAwACAAEAAQD/AP4A/gD+AP0A/AACAAkAEQAbAC0ARgBeAHIAogDUAPAA8QDhANYA0gDLAMAAqgCcAJUA'
    + 'igB8AGUAVwBMAEMAPQAwACEAFAAKAAQAAQAAAP8A/gD9APsA+gD4APcA9QDyAPAA7wDuAPAA8wD5AP0A/gD+AP4A/gD+AP4A'
    + '/QD8APsA+gD4APUA7QDiANsA0ADPAM8A1gDnAPIA+wD+AP4A/QD4APEA6ADdANkA1QDXAOAA8gD/AP8ACAAOABQAGwAfACUA'
    + 'KQAsAC4AMgA2ADoAOgA7ADsAOwA6ADkANgAwACsAJAAeABoAFgARABAADwANAAwACgAIAAcABwAHAAUABAAEAAIAAQABAP8A'
    + '/gD+AP4A/gD+AP4A/QD8APoA9wD1APMA8wDyAPIA8gDzAPQA9gD4APsA/QD8APsA+wD8AP0A/QD9AP0A/QD9APwA+wD5APgA'
    + '9QD0APMA8wD0APUA9gD3APgA+gD9AP8ABAAIABUAGgAbAB0AHwAgACAAGgAXABcAFwAXABYAFQAUABMAEgAUABcAGwAdACAA'
    + 'IQAlAC4APgBZAHwAkgCkALQAxQDKAM0A0wDoAPIA9gD6AP0A/wABAAUACgAOABMAFwAaABwAHQAfACAAHwAfAB8AIgAqADMA'
    + 'QABMAFkAbQCLAJkAqwC2AL8AxwDNANsA5QDwAPIA8gD1APsA/wD/AP4A/QD8APsA+wD6APoA/QD/AP4A/gD9AP0A+wD3AOoA'
    + '3ADXAM4AyQDIAAAA///////////9/fn97v3o/dj9z/3N/cn91P3j/e798/0J/hn+J/5D/lv+cf6H/pv+tP7D/s7+3/4L/xv/'
    + 'N/9K/1r/X/9m/2r/bf9v/3H/d/97/4H/h/99/3b/bP9u/4X/nP+z/9n//wAQAA0ACgAHAAYABgAFAAMAAQAAAP8A/gD+AP4A'
    + '/gD+AP4A/QD8APsA+QD4APgA+AD4APgA+AD4APcA9gD2APYA9gD2APYA9gD2APYA9gD2APYA9wD3APkA+gD9AAEABgAOABYA'
    + 'HAAnADkASwBcAGUAagBsAHIAfQClALoA0ADYAOQA9wD/AP0A+QD1AO4A5gDfANUAwgChAJAAegBkAE4ARAA5ACkAHgAZABYA'
    + 'FAAUABIAFAAUABYAFwAWABMAEwARABAADgAMAAoACQAGAAMAAQAAAP8A/gD+AP4A/gD+AP4A/gD9APsA+QD4APgA9wD2APUA'
    + '9AD0APQA9AD0APQA9QH8APYA9QD2APYA9QD1APQA8wDwAO4A7ADqAOsA7ADuAPIA9gD8AP8AAQAFABAAGQAlADEASQBYAHgA'
    + 'oQC/AMkA1QDlAPEA+wD/AP8ABAAHAAsADAAQABEAEwAWABcAFwAYABsAHwAkACsAMgA+AEwAXgBuAIUApgC/AN8A/gAFABQA'
    + 'IAAoAC4AMAAwACwAJgAgABwAFgAQAAwACgAIAAgABgAEAAMAAQAAAAEAAgADAAQABgAIAAkACgAKAAoACgAKAAoACQAHAAQA'
    + 'AgABAAAA/gD+AP0A/QD8APsA+gD5APgA9wD2APUA9QD1APcA+AD8AP8ABQAJAA8AEgAWAAgA',
  error:
    'UklGRvzWAABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YbrWAAAAAAAACgAMAA8AEwAYACAAJgAuADQAOwBCAGEA'
    + 'iQCnAMsA3gD6AP4A+wDtANAAwgCtAJEAhgCBAH4AdQBqAF0ATAA9ACsAHgAXAAYAAAD//gD8APoA+AABAAIABQAIAA0AEQAU'
    + 'AB4AKQA0AD8ARgBOAFUAXgBqAHoAkQCkALcAzQDaAOAA6QD2AP0A/QD6APMA6wDmAN0A1QDMALkAqACNAIMAdQBlAFQARgA9'
    + 'ADEAJgAhABkADgADAAMABgAIAAsAEQAUABoAHgAhACYAKQAqACsAKwAtAC4AMAAyADcAOwBAAEcATwBYAGYAeQCZAK8A1wDm'
    + 'APQA/gD/APwA8QDjANkA0gDHAMEArQCjAKIAnQCiAKYAkgCHAH0AdABtAGYAZABmAGYAZQBhAF8AVQBJADoAMgApAB0AEgAC'
    + 'AP4A/QD5APQA9AD1APcA+AD6APoA+QD4APgA9gD1APQA8wDyAPIA8QDyAPMA9AD1APkA+wD/AP4A/QD6APMA6wDjANsAzwDP'
    + 'ANUA5AD0AP8ACAAUACEAMQBGAEsATABUAFkAXgBiAF4AUwBDAEIARwBQAFoAYQBjAG0AeACNAJgAmwCmALMAywDNANEA1gDh'
    + 'APcA/gAEAAoADgASABQAFgAZABwAHwAkAC4AOQBFAFEAWgBiAGcAcgCLAJkAowCoALAAvADJANAA1QDdAOMA7gD0APsA/gD+'
    + 'AP4A/QD6APkA+QD4APgA9gD1APQA9AD0APQA9AD0APQA9QD2APgA+gD+AAIACQARABkAHQAgACEAHwAbABYAEQAQABEAEgAV'
    + 'AB0AJwA7AFcAbwCWALEA3AD+AAkAFQAaABsAFwASAA4ACgAFAAIAAQD/AP4A/gD+AP0A/QD8APsA+gD5APgA9gD1APQA8wDy'
    + 'APEA7gDqAOYA4ADZAOkA+wD/AAEABAAEAAQABAAEAAMAAQD/AP4A/QD7APkA+AD2APQA8wDyAPAA8ADxAPMA9gD8AP8AAwAI'
    + 'ABAAHAAwAEYAVQBjAHMAlgCrAL8A0ADWAN8A6gDxAPcA+gD/AP4A/gD9APsA+gD5APgA9gD1APQA9ADzAPEA8ADvAOwA6QDj'
    + 'ANwA1ADLAMUAwADBAMIAxQDMANUA3ADoAPEA9AD4APkA+AD1AOwA3gDQAMgAxwDKANoA7QD4AP8ABgANAA4ADgAQABAADgAN'
    + 'AAwACwANABEAFgAgADsAUgBvAJ4A2QD5AP4ACQAUABwAIwApACsAKgAmACEAGwARAAkABQADAAIABwAOABcAHgAmADQASABa'
    + 'AHEAjwCwANQA4AD2AP4ABgAPABYAHQAlADEAQABOAFcAYgBlAGAAWgBRAFQAWwBkAGYAZABaAFMARwA9ADYAMwAwAC0AJwAi'
    + 'ABsAEgAFAAIA/v/8/fj98v3y/fb9+f36/fr9+v35/fj96/3q/er97/39/gD+A/4F/gb+Gf4k/j7+X/6B/pL+nf6w/s/+z/7V'
    + '/un+C/8d/0f/Xv9w/33/jv+w/8X/0P/t//L/9v/8//7/Av8I/wv/BP8B/wD/AAEABAAIAAsADgAQABEAEQATABMAFAAWABQA'
    + 'FAASABEADwANAAwACgAIAAcABgAFAAQAAwADAAIAAQAQABwALgBEAFkAbQCNAKQAswDMANAA2wDmAO8A9QD+AAQACAANABYA'
    + 'HwAnADQARQBOAFcAXwBjAGcAdAB+AIUAlgCaAKUAqwCzALoAwQDGAM4A1gDbAOAA5wDwAPUA+gD9AP4A/QD8APsA+gD5APgA'
    + '9gD1APQA8wDyAPIA8QD0APcA/gAEAAsAEwAeAC8ASgBaAHYAmgCyAMAAygDRANoA5gDxAPUA9gD1APQA8wDyAPAA8ADxAPMA'
    + '9AD0APQA9AD0APQA9AD0APQA9AD0APQA9AD0APQA9AD0APQA9AD1APYA9wD5APsA/gABAAUACgAOABIAFAAWAAYAAwABAP4A'
    + '/QD7APkA+AD2APQA9AD0APQA9AD0APQA9AD0APQA9AD0APUA9QD2APYA9wD4APkA+wD+AP8A/gD8APgA9QDyAO8A7wDwAPQA'
    + '9QD3APsA/wADAAcACgANAA4AEAAQAA8ADQALAAoABwAGAAQAAwACAAMAAwAEAAUABgAHAAgACQAMABAAGgAnAD8AXwBzAJgA'
    + 'sADPAN0A7gD0AP4ACgAUABwAJQAwAD8ARgBPAFYAVABPAEoARwBIAEkATQBVAGAAZQBiAF4AWQBPADwALgAfABQACAAFAAQA'
    + 'AwADAAUABgAIAAkACwAMAA4ADwAQAA8AEAAPAA4ADQAKAAkABwAGAAYABwAIgICBgYODh4eHj4+UlJSYmJicnJzExMTExMTk'
    + '5OTk5OTk5ORQUFA4ODg0NDAwMDQ0ODg8PEBAQEBAQEBAQEBAQEBAQEBAQEA8PDg0MDQsKCQgHBgUFAgEAAAD+/v38/P39/f7'
    + '+/v7+/v79/f39/fz8/P39/f7+/v7+/v7+/v7+/v7+/v7+/v7+/f39/f38/Pz9/f7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v39/f39/f39/f39/f7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
    + '+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7'
};

AUDIO_CUE_SOURCES['hp-damage'] = AUDIO_CUE_SOURCES.error;
AUDIO_CUE_SOURCES['hp-heal'] = AUDIO_CUE_SOURCES.success;
AUDIO_CUE_SOURCES['hp-down'] = AUDIO_CUE_SOURCES.warn;
AUDIO_CUE_SOURCES['sp-gain'] = AUDIO_CUE_SOURCES.success;
AUDIO_CUE_SOURCES['sp-spend'] = AUDIO_CUE_SOURCES.warn;
AUDIO_CUE_SOURCES['sp-empty'] = AUDIO_CUE_SOURCES.error;

const AUDIO_CUE_TYPE_MAP = {
  success: 'success',
  info: 'success',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
  danger: 'error',
  hp: 'hp-damage',
  heal: 'hp-heal',
  down: 'hp-down',
  sp: 'sp-spend',
  gift: 'success',
  transaction: 'success',
  notification: 'success',
};

const audioCueData = new Map();
const audioCueBufferPromises = new Map();
let cueAudioCtx = null;
let toastTimeout;
let toastLastFocus = null;
let toastFocusGuardActive = false;
let toastFocusHandlersBound = false;
let toastControlsBound = false;

function decodeBase64ToUint8Array(base64) {
  try {
    if (typeof globalThis?.atob === 'function') {
      const binary = globalThis.atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof globalThis?.Buffer === 'function') {
      return Uint8Array.from(globalThis.Buffer.from(base64, 'base64'));
    }
  } catch {}
  return new Uint8Array(0);
}

function preloadAudioCues() {
  if (audioCueData.size) return;
  try {
    Object.entries(AUDIO_CUE_SOURCES).forEach(([key, value]) => {
      const bytes = decodeBase64ToUint8Array(value);
      if (bytes.length) {
        audioCueData.set(key, bytes);
      }
    });
  } catch {}
}

function ensureCueAudioContext() {
  if (cueAudioCtx) return cueAudioCtx;
  const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctor) return null;
  try {
    cueAudioCtx = new Ctor();
  } catch {
    cueAudioCtx = null;
  }
  return cueAudioCtx;
}

function resolveAudioCueType(type) {
  if (typeof type !== 'string') return 'success';
  const normalized = type.toLowerCase();
  return AUDIO_CUE_TYPE_MAP[normalized] || 'success';
}

function decodeAudioBuffer(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = buffer => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const rejectOnce = err => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    try {
      const maybePromise = ctx.decodeAudioData(arrayBuffer, resolveOnce, rejectOnce);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolveOnce, rejectOnce);
      }
    } catch (err) {
      rejectOnce(err);
    }
  });
}

function getAudioCueBufferPromise(ctx, cue) {
  if (!ctx || !audioCueData.has(cue)) return null;
  let promise = audioCueBufferPromises.get(cue);
  if (!promise) {
    const bytes = audioCueData.get(cue);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    promise = decodeAudioBuffer(ctx, arrayBuffer).catch(err => {
      audioCueBufferPromises.delete(cue);
      throw err;
    });
    audioCueBufferPromises.set(cue, promise);
  }
  return promise;
}

function closeCueAudioContext() {
  if (cueAudioCtx && typeof cueAudioCtx.close === 'function') {
    const ctx = cueAudioCtx;
    cueAudioCtx = null;
    audioCueBufferPromises.clear();
    try {
      ctx.close();
    } catch {}
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', closeCueAudioContext, { once: true });
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      closeCueAudioContext();
    }
  });
}

function playToneFallback(type) {
  try {
    const ctx = ensureCueAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const rampUpDuration = 0.015;
    const totalDuration = 0.15;
    const sustainEnd = now + totalDuration - 0.03;
    osc.type = 'sine';
    osc.frequency.value = type === 'error' ? 220 : 880;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + rampUpDuration);
    gain.gain.setValueAtTime(0.1, sustainEnd);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + totalDuration);
  } catch {
    /* noop */
  }
}

function playTone(type) {
  const cue = resolveAudioCueType(type);
  const ctx = ensureCueAudioContext();
  if (ctx && audioCueData.has(cue)) {
    if (typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch {}
    }
    const bufferPromise = getAudioCueBufferPromise(ctx, cue);
    if (bufferPromise) {
      bufferPromise.then(buffer => {
        try {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = cue === 'error' ? 0.25 : 0.2;
          source.buffer = buffer;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
        } catch {
          playToneFallback(type);
        }
      }).catch(() => {
        playToneFallback(type);
      });
      return;
    }
  }
  playToneFallback(type);
}

function focusToastElement(el, { preserveSource = true } = {}) {
  if (!el) return;
  if (typeof el.setAttribute === 'function') {
    const canCheck = typeof el.hasAttribute === 'function';
    if (!canCheck || !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
  }
  if (preserveSource) {
    const active = document?.activeElement;
    if (active && active !== el && active !== document.body && document.contains(active)) {
      toastLastFocus = active;
    }
  }
  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function restoreToastFocus() {
  const target = toastLastFocus;
  toastLastFocus = null;
  if (!target || typeof target.focus !== 'function') return;
  if (!document.contains(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function ensureToastFocusHandlers() {
  if (toastFocusHandlersBound) return;
  toastFocusHandlersBound = true;
  document.addEventListener('focusin', e => {
    if (!toastFocusGuardActive) return;
    const toastEl = $('toast');
    if (!toastEl || !toastEl.classList.contains('show')) return;
    if (toastEl.contains(e.target)) return;
    focusToastElement(toastEl, { preserveSource: false });
  });
}

function dispatchToastEvent(name, detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function hideToastElement(options = {}) {
  const { restoreFocus = true } = options;
  const t = $('toast');
  if (!t) return;
  const wasShown = t.classList.contains('show');
  t.classList.remove('show');
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  toastFocusGuardActive = false;
  if (restoreFocus) {
    restoreToastFocus();
  } else {
    toastLastFocus = null;
  }
  if (wasShown) {
    dispatchToastEvent('cc:toast-dismissed');
  }
}

function toast(msg, type = 'info') {
  const t = $('toast');
  if (!t) return;
  let opts;
  if (typeof type === 'object' && type !== null) {
    opts = type;
  } else if (typeof type === 'number') {
    opts = { type: 'info', duration: type };
  } else {
    opts = { type, duration: 5000 };
  }
  const toastType = typeof opts.type === 'string' && opts.type ? opts.type : 'info';
  const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
  const html = typeof opts.html === 'string' ? opts.html : '';
  if (html) {
    t.innerHTML = html;
  } else {
    t.textContent = msg ?? '';
  }
  t.className = toastType ? `toast ${toastType}` : 'toast';
  t.classList.add('show');
  playTone(toastType);
  clearTimeout(toastTimeout);
  ensureToastFocusHandlers();
  const shouldTrap = !(document?.body?.classList?.contains('modal-open'));
  toastFocusGuardActive = shouldTrap;
  focusToastElement(t, { preserveSource: true });
  if (!toastControlsBound) {
    toastControlsBound = true;
    t.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hideToastElement();
      }
    });
    t.addEventListener('click', () => hideToastElement());
  }
  if (Number.isFinite(duration) && duration > 0) {
    toastTimeout = setTimeout(() => {
      toastTimeout = null;
      hideToastElement();
    }, duration);
  } else {
    toastTimeout = null;
  }
  dispatchToastEvent('cc:toast-shown', { message: msg, options: opts });
}

function dismissToast() {
  hideToastElement();
}

function hasAudioCue(name) {
  return audioCueData.has(name);
}

preloadAudioCues();

if (typeof window !== 'undefined') {
  window.toast = toast;
  window.dismissToast = dismissToast;
  window.playTone = playTone;
}

export { toast, dismissToast, playTone, hasAudioCue };
