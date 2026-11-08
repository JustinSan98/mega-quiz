"""Baut index.html, Manifest, Service Worker und Icons ins Repo-Hauptverzeichnis.
Nutzung: ./setup.sh (einmalig), dann: python3 build.py"""
import json, os, base64, collections, zipfile
from bilder import IMG
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DEPS=os.path.join(HERE,'.deps')
def num(s): return float(s) if '.' in s else int(s)
qs,seen=[],set()
for fn in ('fragen.txt','neu.txt'):
    for line in open(os.path.join(HERE,fn),encoding='utf8'):
        line=line.strip()
        if not line or line.startswith('#'): continue
        p=[x.strip() for x in line.split('|')]; c,t,q=p[0],p[1],p[2]
        assert q not in seen,'doppelt: '+q; seen.add(q)
        if t=='n': d={'c':c,'t':'n','q':q,'a':num(p[3]),'u':p[4]}
        elif t=='w': d={'c':c,'t':'w','q':q,'a':[x.strip() for x in p[3].split(';') if x.strip()]}
        elif t=='s': d={'c':c,'t':'s','q':q,'a':num(p[3]),'u':p[4],'rn':p[5],'rv':num(p[6]),'rs':p[7],'tn':p[8],'ts':p[9]}
        else: raise ValueError(line)
        if q in IMG: d['img']=IMG[q]
        qs.append(d)
cnt=collections.Counter((q['c'],q['t']) for q in qs)
for c in dict.fromkeys(q['c'] for q in qs): print(f"{c:24} Zahl {cnt[(c,'n')]:3}  Wort {cnt[(c,'w')]:3}  Größe {cnt[(c,'s')]:3}")
print('gesamt',len(qs))
def b64(p): return base64.b64encode(open(p,'rb').read()).decode()
F=lambda *a: os.path.join(DEPS,*a)
s=open(os.path.join(HERE,'template.html'),encoding='utf8').read()
s=s.replace('__FONT_SE__',b64(F('fontsource-special-elite-5.3.0','package','files','special-elite-latin-400-normal.woff2')))
s=s.replace('__FONT_CP4__',b64(F('fontsource-courier-prime-5.3.0','package','files','courier-prime-latin-400-normal.woff2')))
s=s.replace('__FONT_CP7__',b64(F('fontsource-courier-prime-5.3.0','package','files','courier-prime-latin-700-normal.woff2')))
s=s.replace('__ICON180__',b64(os.path.join(HERE,'icon180.png'))).replace('__ICON512__',b64(os.path.join(HERE,'icon512.png')))
s=s.replace('__SHAPES__',open(os.path.join(HERE,'shapes.js'),encoding='utf8').read())
s=s.replace('__QUESTIONS__',json.dumps(qs,ensure_ascii=False))
fb=json.load(open(os.path.join(HERE,'firebase.json')))
s=s.replace('__ONLINE__',open(os.path.join(HERE,'online.js'),encoding='utf8').read().replace('__FBCONFIG__',json.dumps(fb)))
s=s.replace('__QRLIB__',open(F('qrcode-generator-2.0.4','package','dist','qrcode.js'),encoding='utf8').read())
s=s.replace('__APPHEAD__','<link rel="manifest" href="manifest.webmanifest">')
s=s.replace('__APPSCRIPT__',"<script>if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('sw.js').catch(function(){})}</script>")
open(os.path.join(ROOT,'index.html'),'w',encoding='utf8').write(s)
print('index.html',len(s.encode())//1024,'KB')
