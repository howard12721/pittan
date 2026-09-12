async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:5173/?room=touch-'+Date.now()+'&user=touch');await p.locator('.role-card').first().waitFor();
  await p.locator('.mobile-nav').getByRole('button',{name:'お題',exact:true}).click();await p.getByRole('button',{name:'お題を投稿',exact:true}).click();
  for(const [i,text] of ['自由に使える100万円があったら？','最近、密かにハマっていることは？','1週間だけ別の仕事をするなら？'].entries()){
   if(i)await p.locator('.queue-heading>.button').click();await p.getByRole('textbox',{name:'お題を投稿',exact:true}).fill(text);await p.getByRole('button',{name:'投稿する',exact:true}).click();await p.locator('dialog').waitFor({state:'detached'});
  }
  const before=await p.locator('.queue-list .topic-text').allTextContents(),h=await p.locator('.drag-handle').first().boundingBox(),t=await p.locator('.sortable-topic').nth(2).boundingBox(),cdp=await context.newCDPSession(p);
  const x=h.x+h.width/2,start=h.y+h.height/2,end=t.y+t.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start,id:1}]});await p.waitForTimeout(300);
  for(let i=1;i<=18;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/18,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForFunction(first=>document.querySelector('.queue-list .topic-text')?.textContent!==first,before[0]);await p.waitForFunction(()=>!document.querySelector('[data-dnd-placeholder]'));await p.waitForTimeout(500);
  const after=await p.locator('.queue-list .topic-text').allTextContents();if(after.length!==3||after[2]!==before[0])throw Error('Touch order incorrect');
  return {before,after,touchDrag:true,errors};
 }finally{await context.close();}
}
