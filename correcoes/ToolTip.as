package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.BattalionMain;
   import com.gamedozer.battalion.display.GameSprite;
   import com.gamedozer.battalion.game.GameManager;
   import com.gamedozer.battalion.utils.BitmapLibrary;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   import flash.text.TextFormatAlign;
   
   public class ToolTip extends GameSprite
   {
      
      private static var s_activeToolTip:ToolTip = null;
      
      private var m_target:DisplayObject;
      
      public function ToolTip()
      {
         super();
         this.visible = false;
         this.mouseChildren = false;
         this.mouseEnabled = false;
      }
      
      public static function createToolTip(a_target:DisplayObject, a_title:String, a_message:String) : void
      {
         var text:TextField = null;
         var toolTip:ToolTip = new ToolTip();
         var info:Sprite = new Sprite();
         var infoHolder:Sprite = new Sprite();
         var header:TextField = new DefaultTextField(16777215,TextFormatAlign.CENTER);
         header.text = a_title;
         header.width = 150;
         header.height = header.textHeight + 5;
         text = new DefaultTextField(0);
         text.text = a_message;
         text.width = 150;
         text.width = Math.min(150,text.textWidth + 5);
         text.height = text.textHeight + 5;
         text.y = header.height;
         infoHolder.addChild(header);
         infoHolder.addChild(text);
         var bg:Sprite = FrameMaker.createBlock(BitmapLibrary.loadBitmap("spotted_texture"),infoHolder.width,infoHolder.height);
         var bgBorder:Sprite = new Sprite();
         bgBorder.graphics.lineStyle(1,0,0.75);
         bgBorder.graphics.drawRect(0,0,infoHolder.width,infoHolder.height);
         bgBorder.graphics.lineStyle(1,0,0);
         bgBorder.graphics.beginFill(11296285,1);
         bgBorder.graphics.drawRect(1,1,header.width - 1,header.height - 1);
         bg.addChild(bgBorder);
         info.addChild(bg);
         info.addChild(infoHolder);
         toolTip.addChild(info);
         toolTip.listenForMouseEvents(a_target);
      }
      
      private function hide() : void
      {
         removeEventListener(Event.ENTER_FRAME,tick);
         removeEventListener(Event.ENTER_FRAME,fadeOut);
         this.visible = false;
      }
      
      private function tick(a_event:Event) : void
      {
         if(!this.hitTestPoint(this.stage.mouseX,this.stage.mouseY,true) && !m_target.hitTestPoint(this.stage.mouseX,this.stage.mouseY,true))
         {
            addEventListener(Event.ENTER_FRAME,fadeOut);
            removeEventListener(Event.ENTER_FRAME,tick);
         }
      }
      
      private function showToolTip(a_event:MouseEvent) : void
      {
         if(this.stage == null)
         {
            return;
         }
         if(s_activeToolTip != null)
         {
            s_activeToolTip.hide();
         }
         removeEventListener(Event.ENTER_FRAME,fadeOut);
         this.visible = true;
         this.alpha = 1;
         this.x = Math.max(0,Math.min(this.stage.mouseX,BattalionMain.WIDTH - this.width));
         this.y = Math.max(0,Math.min(this.stage.mouseY,BattalionMain.HEIGHT - this.height));
         addEventListener(Event.ENTER_FRAME,tick);
         s_activeToolTip = this;
      }
      
      private function fadeOut(a_event:Event) : void
      {
         this.alpha -= 0.03;
         if(this.alpha < 0.1)
         {
            removeEventListener(Event.ENTER_FRAME,fadeOut);
            this.visible = false;
            s_activeToolTip = null;
         }
      }
      
      public function listenForMouseEvents(a_target:DisplayObject) : void
      {
         if(a_target.stage == null)
         {
            throw new Error("ToolTip. You cannot attach a tool tip to an object that has not yet been attached to the stage.");
         }
         m_target = a_target;
         m_target.addEventListener(MouseEvent.MOUSE_OVER,showToolTip);
         GameManager.getInstance().getSprite().parent.addChild(this);
      }
   }
}


