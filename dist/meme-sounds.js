// Downloaded clips are bundled so gameplay never depends on a soundboard service.
export const MEME_CLIPS={
 'shield-custom':{name:'Fortnite Shield Potion',author:'Ultimate Sound Effects Channel',source:'https://www.youtube.com/watch?v=U0goOGwZGnA',license:'User-selected source; license not specified'},
 'heal-custom':{name:'Fortnite Heal',author:'Creator Templates',source:'https://www.youtube.com/watch?v=1XgGupI7DgY',license:'User-selected source; license not specified'},
 'flashbang-custom':{name:'Flashbang',author:'FX Studio Sounds',source:'https://www.youtube.com/watch?v=eCIkubIERIY',license:'User-selected source; license not specified'},
 'orbital-custom':{name:'Tactical Nuke Incoming',author:'Sath Buttons',source:'https://www.youtube.com/watch?v=7olVDwbX8ao',license:'User-selected source; license not specified'},
 coin:{name:'16-bit coin pickup',author:'rigor789',source:'https://freesound.org/people/rigor789/sounds/341979/',license:'CC0'},
 bruh:{name:'Bruh',author:'DXRKCLAN',source:'https://freesound.org/people/DXRKCLAN/sounds/704942/',license:'CC0'},
 pipe:{name:'Metal pipe drop',author:'gamer500',source:'https://freesound.org/people/gamer500/sounds/680841/',license:'CC0'},
 boom:{name:'Backfire boom',author:'CeebFrack',source:'https://freesound.org/people/CeebFrack/sounds/105351/',license:'CC0'},
 wow:{name:'WOWOWOW',author:'XTVSound',source:'https://freesound.org/people/XTVSound/sounds/340858/',license:'CC0'},
 boing:{name:'Cartoon boing',author:'sdroliasnick',source:'https://freesound.org/people/sdroliasnick/sounds/731262/',license:'CC0'},
 fart:{name:'Funny fart',author:'Crimsonblaze',source:'https://freesound.org/people/Crimsonblaze/sounds/833105/',license:'CC BY 4.0'}
};
export const SPELL_MEMES={fireball:'boom',lightning:'pipe',skeletonArmy:'pipe',poison:'fart',arrows:'boing',zap:'bruh',shield:'shield-custom',heal:'heal-custom',meteor:'boom',soulReaper:'fart',bombArrow:'boom',ballista:'pipe',flashbang:'flashbang-custom',orbital:'orbital-custom',coins:'coin'};
const cue=(clip,rate=1,delay=0,gain=1,length=1.3)=>({clip,rate,delay,gain,length});
export function soundCues(spell,kind='cast'){
 if(spell==='coins')return Array.from({length:6},(_,i)=>cue('coin',1+i*.075,i*.095,.38,.5));
 if(spell==='orbital')return[cue('orbital-custom',1,0,1,10)];
 if(['shield','heal','flashbang'].includes(spell)&&['cast','super','impact'].includes(kind))return[cue(SPELL_MEMES[spell],1,0,1,spell==='shield'?8:5)];
 if(kind==='announcement')return[cue('wow',1.25,0,.5,.6)];
 if(kind==='parry')return[cue('pipe',1.3,0,.65),cue('bruh',1,.15,.75,.8)];
 if(kind==='block')return[cue('boing',.75,0,.7)];
 if(kind==='miss')return[cue('bruh',.9,0,.65,.8)];
 if(!Object.hasOwn(SPELL_MEMES,spell))return[];
 if(kind==='tick')return spell==='poison'?[cue('fart',1.8,0,.13,.12)]:spell==='skeletonArmy'?[cue('pipe',1.8,0,.12,.1)]:[];
 const rates={fireball:.9,lightning:1.1,skeletonArmy:1.45,poison:1,arrows:1.8,zap:1.6,shield:1.05,heal:1.15,meteor:.65,soulReaper:.6,bombArrow:.85,ballista:.7,flashbang:1.6,orbital:.6,coins:1},base=cue(SPELL_MEMES[spell],rates[spell]);
 if(spell==='fireball'&&kind==='super')return[cue('boom',.62,0,.85,2),cue('pipe',.55,.18,.25,1.6),cue('boom',.82,.48,.45,1.4)];
 if(spell==='fireball'&&kind==='upgrade-impact')return[cue('boom',.5,0,.85,2),cue('boom',.72,.28,.4,1.3)];
 if(kind==='super')return[{...base,rate:base.rate*.75,length:1.8},cue('wow',.9,.25,.65,1.1),{...base,delay:.5,gain:.5,length:.8}];
 if(kind==='impact')return spell==='arrows'?[cue('pipe',1.7,0,.4,.25),cue('pipe',1.85,.08,.35,.25),cue('pipe',2,.16,.3,.25)]:[{...base,rate:base.rate*.8,gain:.65,length:.8}];
 return[base];
}
