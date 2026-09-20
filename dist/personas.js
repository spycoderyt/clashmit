// Presentation only, keyed by the ids in rules.js. Nothing here affects what the server allows.
export const PERSONA_INFO=Object.freeze({
 mage:{name:'Mage',symbol:'✷',accent:'#63daca',blurb:'Burst'},
 witch:{name:'Witch',symbol:'☠',accent:'#9be564',blurb:'Attrition'},
 archer:{name:'Archer',symbol:'➶',accent:'#ffd84a',blurb:'Tempo'}
});
// Voice words are matched longest first; a space also matches the recognizer running the words together.
export const SPELL_INFO=Object.freeze({
 meteor:{label:'Meteor',symbol:'☄',blurb:'Ultimate',words:['meteor','extinction'],css:'fire',rgb:'255,113,32'},
 soulReaper:{label:'Reaper',symbol:'♜',blurb:'Ultimate',words:['reaper','reeper','ripper','soul reaper','sole reaper','soul reeper','soul ripper','grim reaper'],css:'poison',rgb:'125,255,74'},
 bombArrow:{label:'Bomb Arrow',symbol:'➹',blurb:'Heavy',words:['bomb arrow','explosive arrow'],css:'arrows',rgb:'255,232,170'},
 ballista:{label:'Ballista',symbol:'⌁',blurb:'Ultimate',words:['ballista','railgun'],css:'arrows',rgb:'255,232,170'},
 flashbang:{label:'Flashbang',symbol:'✹',blurb:'Blind and stun',words:['flashbang','flash bang','flash bank'],css:'lightning',rgb:'255,255,255'},
 fireball:{label:'Fireball',symbol:'✷',blurb:'25 damage · splash',words:['fire ball'],css:'fire',rgb:'255,113,32'},
 lightning:{label:'Lightning',symbol:'ϟ',blurb:'Ignores shield',words:['lightning'],css:'lightning',rgb:'146,180,255',bolt:true},
 skeletonArmy:{label:'Skeletons',symbol:'☠',blurb:'Ignores shield · 5/s for 6s',words:['skeleton army','skeletons','skeleton','super skeleton','super skeletons','super skeleton army','supper skeleton','super skelton','bone legion','bone region'],css:'skeletons',rgb:'226,232,214'},
 poison:{label:'Poison',symbol:'☣',blurb:'5 + 3/s for 5s · splash',words:['poison'],css:'poison',rgb:'125,255,74'},
 arrows:{label:'Arrows',symbol:'➶',blurb:'10 damage · fast · splash',words:['arrows','arrow'],css:'arrows',rgb:'255,232,170'},
 zap:{label:'Zap',symbol:'⚡',blurb:'Ignores shield · stuns',words:['zap','zapp'],css:'zap',rgb:'255,230,80',bolt:true},
 shield:{label:'Shield',symbol:'◇',blurb:'Blocks Fireball, Poison, Arrows',words:['shield'],css:'shield',rgb:'107,210,255'},
 heal:{label:'Heal',symbol:'+',blurb:'Restore 20',words:['heal','heel'],css:'heal',rgb:'120,255,170'}
});
export const deckWords=deck=>Object.fromEntries(deck.map(id=>[id,SPELL_INFO[id].words]));
export const labelOf=id=>SPELL_INFO[id]?.label||id;
