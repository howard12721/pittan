async(page)=>{
 const results=[];
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:360,height:640}]){
  await page.setViewportSize(viewport);
  for(const fixture of ['lobby','answer','discussion-host','topics-host','guessing-host','results']){
   await page.goto('http://127.0.0.1:5173/?fixture='+fixture+'&stress=true&safe=20');await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);
   const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('.answer-card,.participant,.topic-row,.reveal-row,.guess-row')].filter(n=>n.scrollWidth>n.clientWidth+2||n.scrollHeight>n.clientHeight+2).map(n=>n.className)}));
   if(overflow.document||overflow.cards.length){await page.screenshot({path:'output/playwright/text-bounds-failure.png'});throw Error(JSON.stringify({viewport,fixture,overflow}));}
   results.push({width:viewport.width,fixture,overflow:false});
  }
 }
 return results;
}
