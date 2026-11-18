package com.gamedozer.battalion.display
{
   import com.gamedozer.battalion.BattalionMain;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.geom.Rectangle;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.filters.GlowFilter;
   
   public class GameButton extends GameSprite
   {
      
      public var release:Function;
      
      public var mouseOut:Function;
      
      protected var m_glowOnRollover:Boolean;
      
      public var value:*;
      
      protected var cursor:String;
      
      public var mouseOver:Function;
      
      public function GameButton(a_sprite:DisplayObject, a_cursor:String = "default", a_glowOnRollover:Boolean = false)
      {
         super();
         cursor = a_cursor;
         m_glowOnRollover = a_glowOnRollover;
         this.useHandCursor = true;
         this.buttonMode = true;
         addChild(a_sprite);
         var bounds:Rectangle = a_sprite.getBounds(this);
         var hit:Sprite = new Sprite();
         hit.graphics.beginFill(0);
         hit.graphics.drawRect(bounds.x,bounds.y,bounds.width,bounds.height);
         hit.graphics.endFill();
         hit.visible = false;
         addChild(hit);
         hitArea = hit;
         mouseChildren = false;
         addEventListener(MouseEvent.CLICK,clickHandler);
         addEventListener(MouseEvent.MOUSE_OVER,overHandler);
         addEventListener(MouseEvent.MOUSE_OUT,outHandler);
      }
      
      internal function clickHandler(a_event:Event) : void
      {
         if(release != null)
         {
            release();
         }
      }
      
      internal function unglow() : void
      {
         this.filters = [];
      }
      
      internal function glow() : void
      {
         this.filters = [new GlowFilter(0)];
      }
      
      override public function clone() : GameSprite
      {
         var b:GameButton = new GameButton(getChildAt(0) as GameSprite);
         b.value = value;
         b.release = release;
         b.mouseOver = mouseOver;
         return b;
      }
      
      public function setCursor(a_cursor:String) : void
      {
         cursor = a_cursor;
      }
      
      internal function outHandler(a_event:Event) : void
      {
         BattalionMain.getMouseCursor().setCursor("default");
         if(mouseOut != null)
         {
            mouseOut();
         }
         if(m_glowOnRollover)
         {
            unglow();
         }
      }
      
      internal function overHandler(a_event:Event) : void
      {
         if(cursor != null)
         {
            BattalionMain.getMouseCursor().setCursor(cursor);
         }
         if(mouseOver != null)
         {
            mouseOver();
         }
         if(m_glowOnRollover)
         {
            glow();
         }
      }
      
      public function turnOffGlow() : void
      {
         unglow();
         m_glowOnRollover = false;
      }
   }
}


