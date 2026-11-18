package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.BattalionMain;
   import com.gamedozer.battalion.display.TileSheet;
   import com.gamedozer.battalion.utils.MouseHandler;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   public class MouseCursor extends Sprite
   {
      
      protected var cursor:TileSheet;
      
      public function MouseCursor(a_cursor:TileSheet)
      {
         super();
         cursor = a_cursor;
         addChild(cursor);
         BattalionMain.getStage().addEventListener(Event.MOUSE_LEAVE,cursorHide);
         BattalionMain.getStage().addEventListener(MouseEvent.MOUSE_MOVE,cursorFollow);
         mouseEnabled = false;
         mouseChildren = false;
         setCursor("default");
      }
      
      public function cursorFollow(a_event:MouseEvent) : void
      {
         if(!visible)
         {
            visible = true;
         }
         x = MouseHandler.getInstance().getX();
         y = MouseHandler.getInstance().getY();
         a_event.updateAfterEvent();
      }
      
      public function setCursor(a_frame:String) : void
      {
         cursor.playAnimation(a_frame);
      }
      
      public function cursorHide(a_event:Event) : void
      {
         visible = false;
      }
   }
}


